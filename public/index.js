(() => {
    const UI = window.UI || {
        showToast: (text) => { try { window.alert(text); } catch {} },
        setButtonLoading: (btn, isLoading, opts) => {
            if (!btn) return;
            btn.disabled = Boolean(isLoading);
            if (!isLoading && opts?.htmlIdle != null) btn.innerHTML = opts.htmlIdle;
            if (isLoading && opts?.htmlLoading != null) btn.innerHTML = opts.htmlLoading;
        },
        readResponseBodySafe: async (r) => { try { return await r.json(); } catch { return { error: 'Response tidak valid.' }; } },
        askTextDialog: async () => { const v = (window.prompt('Nama pengirim:') || '').trim(); return v || null; },
    };

    const form = document.getElementById('trakeostomiForm');
    const submitBtn = document.getElementById('submitBtn');
    const fileInput = document.getElementById('tindakan_gambar');
    const preview = document.getElementById('imagePreview');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const autosaveIndicator = document.getElementById('autosaveIndicator');
    const autosaveText = document.getElementById('autosaveText');
    const clearDraftBtn = document.getElementById('clearDraftBtn');
    const successOverlay = document.getElementById('successOverlay');

    const DRAFT_KEY = 'trakeo_draft';
    const FIELDS = ['pasien', 'nomor_reka_medik', 'asisten_perawat', 'diagnosa', 'nomor_alat', 'pemakaian_alat'];
    const FIELD_LIMITS = {
        'pasien': 120,
        'nomor_reka_medik': 60,
        'asisten_perawat': 120,
        'diagnosa': 160,
        'nomor_alat': 60,
        'pemakaian_alat': 120
    };
    const MAX_FILES = 10;
    const MAX_SIZE = 5 * 1024 * 1024;
    const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

    // --- Admin session check ---
    const adminLoginLink = document.getElementById('adminLoginLink');
    const adminDashboardLink = document.getElementById('adminDashboardLink');
    const adminLogoutBtn = document.getElementById('adminLogoutBtn');

    fetch('/api/reports', { method: 'GET' })
        .then((r) => {
            if (r.ok) {
                adminLoginLink?.classList.add('hidden');
                adminDashboardLink?.classList.remove('hidden');
                adminLogoutBtn?.classList.remove('hidden');
            }
        }).catch(() => {});

    adminLogoutBtn?.addEventListener('click', () => {
        const csrfToken = (() => { try { return window.sessionStorage.getItem('csrfToken') || ''; } catch { return ''; } })();
        fetch('/api/logout', { method: 'POST', headers: csrfToken ? { 'x-csrf-token': csrfToken } : {} })
            .finally(() => window.location.reload());
    });

    // --- Progress & validation ---
    function updateProgress() {
        const filled = FIELDS.filter(id => (document.getElementById(id)?.value || '').trim().length > 0).length;
        const pct = Math.round((filled / FIELDS.length) * 100);
        if (progressBar) progressBar.style.width = pct + '%';
        if (progressText) progressText.textContent = `${filled} dari ${FIELDS.length} field diisi`;
    }

    function showFieldError(fieldId, message) {
        const errorEl = document.getElementById('error_' + fieldId);
        if (!errorEl) {
            // Create error element if it doesn't exist
            const newErrorEl = document.createElement('div');
            newErrorEl.id = 'error_' + fieldId;
            newErrorEl.className = 'error-message';
            
            const field = document.getElementById(fieldId);
            if (field && field.parentNode) {
                // Insert after the character counter
                const counter = document.getElementById('counter_' + fieldId);
                if (counter && counter.nextSibling) {
                    field.parentNode.insertBefore(newErrorEl, counter.nextSibling);
                } else {
                    field.parentNode.appendChild(newErrorEl);
                }
            }
        }
        
        const finalErrorEl = document.getElementById('error_' + fieldId);
        if (finalErrorEl) {
            finalErrorEl.textContent = message;
            finalErrorEl.classList.add('show');
        }
    }

    function hideFieldError(fieldId) {
        const errorEl = document.getElementById('error_' + fieldId);
        if (errorEl) {
            errorEl.classList.remove('show');
        }
    }

    function validateField(fieldId, showErrors = false) {
        const field = document.getElementById(fieldId);
        if (!field) return true;
        
        const value = field.value.trim();
        const maxLength = FIELD_LIMITS[fieldId];
        let isValid = true;
        let errorMessage = '';
        
        // Required field check
        if (value.length === 0) {
            isValid = false;
            errorMessage = 'Field ini wajib diisi.';
        } 
        // Length validation
        else if (maxLength && field.value.length > maxLength) {
            isValid = false;
            errorMessage = `Maksimal ${maxLength} karakter.`;
        }
        // Specific field validations
        else if (fieldId === 'nomor_reka_medik' && value.length < 3) {
            isValid = false;
            errorMessage = 'Nomor rekam medik minimal 3 karakter.';
        } else if (fieldId === 'nomor_alat' && value.length < 3) {
            isValid = false;
            errorMessage = 'Nomor alat minimal 3 karakter.';
        }
        
        // Update UI
        if (showErrors) {
            if (isValid) {
                hideFieldError(fieldId);
            } else {
                showFieldError(fieldId, errorMessage);
            }
        }
        
        return isValid;
    }

    function validateFileInput(showErrors = false) {
        const files = Array.from(fileInput.files || []);
        let isValid = true;
        let errorMessage = '';
        
        if (files.length === 0) {
            // File input is optional, so empty is valid
            fileInput.classList.remove('valid', 'invalid');
            hideFieldError('tindakan_gambar');
            return true;
        }
        
        // Check file count
        if (files.length > MAX_FILES) {
            isValid = false;
            errorMessage = `Maksimal ${MAX_FILES} gambar.`;
        }
        // Check individual files
        else {
            for (const file of files) {
                if (!ALLOWED.has(file.type)) {
                    isValid = false;
                    errorMessage = 'Hanya JPG, PNG, dan WEBP yang diizinkan.';
                    break;
                }
                if (file.size > MAX_SIZE) {
                    isValid = false;
                    errorMessage = 'Ada file melebihi 5MB.';
                    break;
                }
            }
        }
        
        // Update UI
        fileInput.classList.remove('valid', 'invalid');
        fileInput.classList.add(isValid ? 'valid' : 'invalid');
        
        if (showErrors) {
            if (isValid) {
                hideFieldError('tindakan_gambar');
            } else {
                showFieldError('tindakan_gambar', errorMessage);
            }
        }
        
        return isValid;
    }

    function setValidationIcon(fieldId, state) {
        const icon = document.getElementById('vi_' + fieldId);
        if (!icon) return;
        icon.className = 'validation-icon';
        if (state === 'valid') {
            icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
            icon.classList.add('show', 'valid');
        } else if (state === 'invalid') {
            icon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
            icon.classList.add('show', 'invalid');
        }
        const input = document.getElementById(fieldId);
        if (input) {
            input.classList.remove('valid', 'invalid');
            if (state) input.classList.add(state);
        }
    }

    function updateCharCounter(fieldId, length, maxLength) {
        const counter = document.getElementById('counter_' + fieldId);
        if (!counter) return;
        
        counter.textContent = `${length} / ${maxLength}`;
        counter.className = 'char-counter';
        
        if (length >= maxLength - 10) {
            counter.classList.add('warning');
        }
        if (length >= maxLength) {
            counter.classList.add('limit');
        }
    }

    function handlePaste(fieldId, event) {
        const maxLength = FIELD_LIMITS[fieldId];
        if (!maxLength) return;
        
        event.preventDefault();
        const paste = (event.clipboardData || window.clipboardData).getData('text');
        const input = event.target;
        const currentValue = input.value;
        const cursorStart = input.selectionStart;
        const cursorEnd = input.selectionEnd;
        
        // Replace selected text with pasted content
        const beforeCursor = currentValue.substring(0, cursorStart);
        const afterCursor = currentValue.substring(cursorEnd);
        let newValue = beforeCursor + paste + afterCursor;
        
        // Truncate if exceeds maxlength
        const wasTruncated = newValue.length > maxLength;
        if (wasTruncated) {
            newValue = newValue.substring(0, maxLength);
            UI.showToast(`Teks dipotong. Maksimal ${maxLength} karakter.`, 'warning');
        }
        
        input.value = newValue;
        
        // Update counter and validation
        updateCharCounter(fieldId, newValue.length, maxLength);
        setValidationIcon(fieldId, newValue.trim().length > 0 ? 'valid' : '');
        updateProgress();
        debounceSaveDraft();
        
        // Set cursor position
        const newCursorPos = Math.min(cursorStart + paste.length, newValue.length);
        input.setSelectionRange(newCursorPos, newCursorPos);
    }

    FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        const maxLength = FIELD_LIMITS[id];
        
        // Initialize character counter
        updateCharCounter(id, el.value.length, maxLength);
        
        el.addEventListener('input', () => {
            const v = el.value;
            const trimmedValue = v.trim();
            
            // Update character counter
            updateCharCounter(id, v.length, maxLength);
            
            // Real-time validation
            const isValid = validateField(id, false);
            setValidationIcon(id, isValid && trimmedValue.length > 0 ? 'valid' : (trimmedValue.length > 0 ? 'invalid' : ''));
            
            updateProgress();
            debounceSaveDraft();
        });
        
        el.addEventListener('blur', () => {
            const v = el.value.trim();
            const isValid = validateField(id, true); // Show errors on blur
            setValidationIcon(id, isValid && v.length > 0 ? 'valid' : (v.length === 0 ? 'invalid' : 'invalid'));
        });
        
        // Handle paste events  
        el.addEventListener('paste', (event) => {
            setTimeout(() => {
                // Validate after paste is processed
                const isValid = validateField(id, true);
                const v = el.value.trim();
                setValidationIcon(id, isValid && v.length > 0 ? 'valid' : 'invalid');
                updateProgress();
            }, 0);
            handlePaste(id, event);
        });
    });

    // --- Auto-save draft ---
    let autosaveTimer = null;
    function saveDraft() {
        if (!autosaveIndicator) return;
        autosaveIndicator.style.display = 'flex';
        autosaveIndicator.className = 'autosave-indicator saving';
        if (autosaveText) autosaveText.textContent = 'Menyimpan...';
        const data = {};
        FIELDS.forEach(id => { data[id] = document.getElementById(id)?.value || ''; });
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {}
        setTimeout(() => {
            autosaveIndicator.className = 'autosave-indicator saved';
            if (autosaveText) autosaveText.textContent = 'Draft tersimpan';
        }, 500);
    }

    function debounceSaveDraft() {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(saveDraft, 1200);
    }

    function loadDraft() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            FIELDS.forEach(id => {
                const el = document.getElementById(id);
                const maxLength = FIELD_LIMITS[id];
                if (el && data[id]) {
                    el.value = data[id];
                    setValidationIcon(id, 'valid');
                    updateCharCounter(id, data[id].length, maxLength);
                }
            });
            updateProgress();
            if (autosaveIndicator) {
                autosaveIndicator.style.display = 'flex';
                autosaveIndicator.className = 'autosave-indicator saved';
                if (autosaveText) autosaveText.textContent = 'Draft dimuat';
                setTimeout(() => { autosaveIndicator.style.display = 'none'; }, 3000);
            }
        } catch {}
    }

    clearDraftBtn?.addEventListener('click', () => {
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        form.reset();
        FIELDS.forEach(id => setValidationIcon(id, ''));
        while (preview.firstChild) preview.removeChild(preview.firstChild);
        updateProgress();
        if (autosaveIndicator) autosaveIndicator.style.display = 'none';
        UI.showToast('Draft dihapus.', 'success');
    });

    loadDraft();

    // --- Image preview ---
    fileInput.addEventListener('change', () => {
        while (preview.firstChild) preview.removeChild(preview.firstChild);
        const files = Array.from(fileInput.files || []);
        
        // Validate files and provide feedback
        const isValid = validateFileInput(true);
        
        if (!isValid) {
            fileInput.value = '';
            return;
        }
        
        // Show previews for valid files
        for (const file of files) {
            const url = URL.createObjectURL(file);
            const wrap = document.createElement('div');
            const img = document.createElement('img');
            img.src = url;
            img.alt = file.name;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            wrap.appendChild(img);
            preview.appendChild(wrap);
        }
    });

    // --- Submit ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Comprehensive validation before submit
        let hasError = false;
        const errors = [];
        
        // Validate all text fields
        FIELDS.forEach(id => {
            if (!validateField(id, true)) {
                hasError = true;
                errors.push(`${getFieldLabel(id)} tidak valid`);
            }
        });
        
        // Validate file input
        if (!validateFileInput(true)) {
            hasError = true;
            errors.push('Upload gambar tidak valid');
        }
        
        if (hasError) {
            UI.showToast('Harap perbaiki kesalahan pada form sebelum menyimpan.', 'error');
            // Focus on first invalid field
            const firstInvalid = FIELDS.find(id => !validateField(id, false));
            if (firstInvalid) {
                document.getElementById(firstInvalid)?.focus();
            }
            return;
        }

        const senderName = await UI.askTextDialog({
            dialogId: 'senderDialog',
            inputId: 'senderNameInput',
            okId: 'senderOk',
            cancelId: 'senderCancel',
            fallbackPrompt: 'Nama pengirim:',
            emptyError: 'Nama pengirim wajib diisi.',
            maxLength: 60,
            tooLongError: 'Nama pengirim terlalu panjang (maks 60 karakter).',
        });
        if (!senderName) {
            UI.showToast('Nama pengirim wajib diisi sebelum menyimpan.', 'error');
            return;
        }

        UI.setButtonLoading(submitBtn, true, {
            htmlLoading: '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...'
        });

        const formData = new FormData(form);
        formData.append('nama_pengirim', senderName);

        // Double-check file validation
        const selectedFiles = Array.from(fileInput.files || []);
        for (const f of selectedFiles) {
            if (!ALLOWED.has(f.type) || f.size > MAX_SIZE) {
                UI.showToast('Validasi gambar gagal. Periksa tipe/ukuran file.', 'error');
                UI.setButtonLoading(submitBtn, false, { htmlIdle: '<i class="fa-solid fa-floppy-disk"></i> Simpan Laporan' });
                return;
            }
        }

        try {
            const response = await fetch('/api/reports', { method: 'POST', body: formData });
            const result = await UI.readResponseBodySafe(response);
            if (response.ok) {
                // Clear draft
                try { localStorage.removeItem(DRAFT_KEY); } catch {}
                // Show success animation
                if (successOverlay) {
                    successOverlay.classList.remove('hidden');
                    setTimeout(() => successOverlay.classList.add('hidden'), 2200);
                }
                form.reset();
                FIELDS.forEach(id => {
                    setValidationIcon(id, '');
                    hideFieldError(id);
                });
                hideFieldError('tindakan_gambar');
                fileInput.classList.remove('valid', 'invalid');
                while (preview.firstChild) preview.removeChild(preview.firstChild);
                updateProgress();
                if (autosaveIndicator) autosaveIndicator.style.display = 'none';
            } else {
                UI.showToast(result?.error || 'Terjadi kesalahan saat menyimpan data.', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            UI.showToast('Gagal terhubung ke server.', 'error');
        } finally {
            UI.setButtonLoading(submitBtn, false, { htmlIdle: '<i class="fa-solid fa-floppy-disk"></i> Simpan Laporan' });
        }
    });
    
    // Helper function to get field labels
    function getFieldLabel(fieldId) {
        const labels = {
            'pasien': 'Nama Pasien',
            'nomor_reka_medik': 'Nomor Rekam Medik',
            'asisten_perawat': 'Asisten Perawat', 
            'diagnosa': 'Diagnosa',
            'nomor_alat': 'Nomor Alat',
            'pemakaian_alat': 'Keterangan Pemakaian'
        };
        return labels[fieldId] || fieldId;
    }

    // Keyboard shortcut: Ctrl+S
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            submitBtn?.click();
        }
    });

    updateProgress();
})();
