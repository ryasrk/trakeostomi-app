const request = require('supertest');
const app = require('../server');
const db = require('../src/db');

// Mock middleware
jest.mock('../src/middleware', () => ({
  ...jest.requireActual('../src/middleware'),
  requireAdmin: (req, res, next) => {
    req.session = req.session || {};
    req.session.isAdmin = true;
    next();
  },
  requireCsrf: (req, res, next) => {
    next();
  },
}));

// Mock db module completely to avoid database connections
jest.mock('../src/db', () => ({
  ...jest.requireActual('../src/db'),
  deleteReport: jest.fn(),
  closeDb: jest.fn(),
}));

describe('DELETE /api/reports/:id', () => {
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    db.closeDb();
  });

  it('should delete report successfully (images cascade-deleted in DB)', async () => {
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

  it('should handle database errors gracefully', async () => {
    db.deleteReport.mockImplementation(() => { throw new Error('DB error'); });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const response = await request(app)
      .delete(`/api/reports/${testData.id}`)
      .expect(500);

    expect(response.body.error).toBe('Gagal menghapus data.');
    consoleSpy.mockRestore();
  });
});