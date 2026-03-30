const request = require('supertest');
const app = require('../server');
const db = require('../src/db');

// Mock the middleware to allow admin access
jest.mock('../src/middleware', () => ({
  ...jest.requireActual('../src/middleware'),
  requireAdmin: (req, res, next) => {
    req.session = req.session || {};
    req.session.isAdmin = true;
    req.session.csrfToken = 'valid-token';
    next();
  },
  requireCsrf: (req, res, next) => {
    next();
  },
}));

// Mock db module
jest.mock('../src/db', () => ({
  ...jest.requireActual('../src/db'),
  deleteReport: jest.fn(),
  getImageById: jest.fn(),
  closeDb: jest.fn(),
}));

describe('Report deletion with DB-stored images', () => {
  let testData;

  beforeEach(() => {
    jest.clearAllMocks();
    
    testData = {
      id: 'test-report-123',
      pasien: 'John Doe',
      asisten_perawat: 'Nurse Jane',
      nomor_alat: 'ALT-001',
      pemakaian_alat: '24 hours',
      diagnosa: 'Test diagnosis',
      nomor_reka_medik: 'MR-001',
      nama_pengirim: 'Dr. Smith',
      tanggal_input: new Date().toISOString(),
      tindakan_gambar: ['/api/images/1', '/api/images/2']
    };

    db.deleteReport.mockReturnValue(testData);
  });

  afterAll(async () => {
    db.closeDb();
  });

  it('should delete report (images cascade-deleted by DB)', async () => {
    const response = await request(app)
      .delete(`/api/reports/${testData.id}`)
      .expect(200);

    expect(response.body.message).toBe('Laporan berhasil dihapus.');
    expect(db.deleteReport).toHaveBeenCalledWith(testData.id);
  });

  it('should handle non-existent report', async () => {
    db.deleteReport.mockReturnValue(null);

    const response = await request(app)
      .delete('/api/reports/non-existent-id')
      .expect(404);

    expect(response.body.error).toBe('Laporan tidak ditemukan.');
  });

  it('should handle database errors during deletion', async () => {
    db.deleteReport.mockImplementation(() => { throw new Error('DB error'); });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const response = await request(app)
      .delete(`/api/reports/${testData.id}`)
      .expect(500);

    expect(response.body.error).toBe('Gagal menghapus data.');
    consoleSpy.mockRestore();
  });
});

describe('GET /api/images/:id - Serve images from database', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    db.closeDb();
  });

  it('should serve image with correct content type', async () => {
    const imageData = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
    db.getImageById.mockReturnValue({
      id: 1,
      report_id: 'test-123',
      image_data: imageData,
      mime_type: 'image/jpeg',
      original_name: 'test.jpg',
    });

    const response = await request(app)
      .get('/api/images/1')
      .expect(200);

    expect(response.headers['content-type']).toMatch(/image\/jpeg/);
    expect(db.getImageById).toHaveBeenCalledWith(1);
  });

  it('should serve PNG images with correct content type', async () => {
    const imageData = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
    db.getImageById.mockReturnValue({
      id: 2,
      report_id: 'test-456',
      image_data: imageData,
      mime_type: 'image/png',
      original_name: 'test.png',
    });

    const response = await request(app)
      .get('/api/images/2')
      .expect(200);

    expect(response.headers['content-type']).toMatch(/image\/png/);
  });

  it('should return 404 for non-existent image', async () => {
    db.getImageById.mockReturnValue(null);

    const response = await request(app)
      .get('/api/images/999')
      .expect(404);

    expect(response.body.error).toBe('Gambar tidak ditemukan.');
  });

  it('should return 404 for image with no data', async () => {
    db.getImageById.mockReturnValue({
      id: 3,
      report_id: 'test-789',
      image_data: null,
      mime_type: 'image/jpeg',
    });

    const response = await request(app)
      .get('/api/images/3')
      .expect(404);

    expect(response.body.error).toBe('Gambar tidak ditemukan.');
  });

  it('should reject invalid image ID (non-numeric)', async () => {
    const response = await request(app)
      .get('/api/images/abc')
      .expect(400);

    expect(response.body.error).toBe('ID gambar tidak valid.');
  });

  it('should reject negative image ID', async () => {
    const response = await request(app)
      .get('/api/images/-1')
      .expect(400);

    expect(response.body.error).toBe('ID gambar tidak valid.');
  });

  it('should reject zero image ID', async () => {
    const response = await request(app)
      .get('/api/images/0')
      .expect(400);

    expect(response.body.error).toBe('ID gambar tidak valid.');
  });

  it('should handle database errors gracefully', async () => {
    db.getImageById.mockImplementation(() => { throw new Error('DB error'); });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const response = await request(app)
      .get('/api/images/1')
      .expect(500);

    expect(response.body.error).toBe('Gagal mengambil gambar.');
    consoleSpy.mockRestore();
  });
});