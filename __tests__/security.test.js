const request = require('supertest');
const fs = require('fs');
const path = require('path');

describe('Security Tests', () => {
    let server;
    let originalEnv;

    beforeEach(() => {
        // Save original environment
        originalEnv = { ...process.env };
        
        // Clear require cache
        Object.keys(require.cache).forEach(key => {
            if (key.includes('trakeostomi-app')) {
                delete require.cache[key];
            }
        });
    });

    afterEach(() => {
        // Restore environment
        process.env = originalEnv;
        
        // Close server if running
        if (server && server.close) {
            server.close();
        }
    });

    describe('Issue #1: Strong Credentials Enforcement in Production', () => {
        test('should refuse to start with weak ADMIN_PASS in production', () => {
            process.env.NODE_ENV = 'production';
            process.env.ADMIN_USER = 'secure_admin'; // Set secure user first
            process.env.ADMIN_PASS = 'admin123';
            process.env.SESSION_SECRET = 'strong_secret_with_enough_characters_to_be_secure_32';

            expect(() => {
                require('../server.js');
            }).toThrow('Server refused to start: Weak admin password detected in production');
        });

        test('should refuse to start with weak ADMIN_USER in production', () => {
            process.env.NODE_ENV = 'production';
            process.env.ADMIN_USER = 'admin';
            process.env.ADMIN_PASS = 'strong_secure_password_123';
            process.env.SESSION_SECRET = 'strong_secret_with_enough_characters_to_be_secure_32';

            expect(() => {
                require('../server.js');
            }).toThrow('Server refused to start: Weak admin username detected in production');
        });

        test('should start successfully with strong credentials in production', () => {
            process.env.NODE_ENV = 'production';
            process.env.ADMIN_USER = 'secure_admin_user';
            process.env.ADMIN_PASS = 'strong_secure_password_123';
            process.env.SESSION_SECRET = 'strong_secret_with_enough_characters_to_be_secure_32';

            expect(() => {
                server = require('../server.js');
            }).not.toThrow();
        });

        test('should allow weak credentials in development mode', () => {
            process.env.NODE_ENV = 'development';
            process.env.ADMIN_USER = 'admin';
            process.env.ADMIN_PASS = 'admin123';
            process.env.SESSION_SECRET = 'dev_only_change_me_change_me_change_me_32chars';

            expect(() => {
                server = require('../server.js');
            }).not.toThrow();
        });
    });

    describe('Issue #2: Strong SESSION_SECRET Validation in Production', () => {
        test('should refuse to start with default SESSION_SECRET in production', () => {
            // Reset environment completely
            Object.keys(process.env).forEach(key => {
                if (key.startsWith('ADMIN_') || key === 'SESSION_SECRET' || key === 'NODE_ENV') {
                    delete process.env[key];
                }
            });
            
            // Set environment before clearing cache
            process.env.NODE_ENV = 'production';
            process.env.ADMIN_USER = 'secure_admin';
            process.env.ADMIN_PASS = 'strong_password_123';  
            process.env.SESSION_SECRET = 'dev_only_change_me_change_me_change_me_32chars';

            // Use Jest's resetModules for proper cache clearing
            jest.resetModules();
            
            expect(() => {
                require('../server.js');
            }).toThrow('Server refused to start: Default or weak session secret detected in production');
        });

        test('should refuse to start with short SESSION_SECRET in production', () => {
            // Reset environment completely
            Object.keys(process.env).forEach(key => {
                if (key.startsWith('ADMIN_') || key === 'SESSION_SECRET' || key === 'NODE_ENV') {
                    delete process.env[key];
                }
            });
            
            // Set environment before clearing cache
            process.env.NODE_ENV = 'production';
            process.env.ADMIN_USER = 'secure_admin';
            process.env.ADMIN_PASS = 'strong_password_123';
            process.env.SESSION_SECRET = 'short_secret';

            // Use Jest's resetModules for proper cache clearing
            jest.resetModules();

            expect(() => {
                require('../server.js');
            }).toThrow('Server refused to start: Default or weak session secret detected in production');
        });

        test('should start with strong SESSION_SECRET in production', () => {
            // Reset environment completely
            Object.keys(process.env).forEach(key => {
                if (key.startsWith('ADMIN_') || key === 'SESSION_SECRET' || key === 'NODE_ENV') {
                    delete process.env[key];
                }
            });
            
            process.env.NODE_ENV = 'production';
            process.env.ADMIN_USER = 'secure_admin';
            process.env.ADMIN_PASS = 'strong_password_123';
            process.env.SESSION_SECRET = 'strong_secret_with_enough_characters_to_be_very_secure';

            // Use Jest's resetModules for proper cache clearing
            jest.resetModules();

            expect(() => {
                server = require('../server.js');
            }).not.toThrow();
        });
    });

    describe('Issue #3: CSRF Token Regeneration After Login', () => {
        let app;

        beforeEach(() => {
            process.env.NODE_ENV = 'test';
            process.env.ADMIN_USER = 'test_admin';
            process.env.ADMIN_PASS = 'test_password_123';
            process.env.SESSION_SECRET = 'test_secret_with_enough_characters_for_testing';
            
            // Clear require cache before requiring
            Object.keys(require.cache).forEach(key => {
                if (key.includes('trakeostomi-app')) {
                    delete require.cache[key];
                }
            });
            
            app = require('../server.js');
        });

        test('should generate fresh CSRF token after login', async () => {
            const agent = request.agent(app);

            // First login
            const loginResponse1 = await agent
                .post('/api/login')
                .send({ username: 'test_admin', password: 'test_password_123' });

            expect(loginResponse1.status).toBe(200);
            expect(loginResponse1.body.success).toBe(true);
            expect(loginResponse1.body.csrfToken).toBeDefined();
            
            const firstToken = loginResponse1.body.csrfToken;

            // Logout
            await agent
                .post('/api/logout')
                .set('x-csrf-token', firstToken);

            // Second login - should get a different CSRF token
            const loginResponse2 = await agent
                .post('/api/login')
                .send({ username: 'test_admin', password: 'test_password_123' });

            expect(loginResponse2.status).toBe(200);
            expect(loginResponse2.body.success).toBe(true);
            expect(loginResponse2.body.csrfToken).toBeDefined();
            expect(loginResponse2.body.csrfToken).not.toBe(firstToken);
        });

        test('should provide /api/csrf-token endpoint for admin users', async () => {
            const agent = request.agent(app);

            // Login first
            const loginResponse = await agent
                .post('/api/login')
                .send({ username: 'test_admin', password: 'test_password_123' });

            expect(loginResponse.status).toBe(200);
            const oldToken = loginResponse.body.csrfToken;

            // Get fresh CSRF token
            const csrfResponse = await agent
                .get('/api/csrf-token');

            expect(csrfResponse.status).toBe(200);
            expect(csrfResponse.body.csrfToken).toBeDefined();
            expect(csrfResponse.body.csrfToken).not.toBe(oldToken);
        });

        test('should deny /api/csrf-token endpoint for non-admin users', async () => {
            const response = await request(app)
                .get('/api/csrf-token');

            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Akses ditolak.');
        });

        test('should validate fresh CSRF token works for protected endpoints', async () => {
            const agent = request.agent(app);

            // Login
            await agent
                .post('/api/login')
                .send({ username: 'test_admin', password: 'test_password_123' });

            // Get fresh CSRF token
            const csrfResponse = await agent
                .get('/api/csrf-token');
            
            const freshToken = csrfResponse.body.csrfToken;

            // Use fresh token for protected endpoint - use /api/reports/stats which requires CSRF
            const statsResponse = await agent
                .get('/api/reports/export.csv')
                .set('x-csrf-token', freshToken);

            expect(statsResponse.status).toBe(200);
        });
    });
});