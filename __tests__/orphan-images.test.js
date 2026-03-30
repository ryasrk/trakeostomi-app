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

// Mock db module
jest.mock('../src/db', () => ({
  ...jest.requireActual('../src/db'),
  getImageById: jest.fn(),
  closeDb: jest.fn(),
}));

describe('GET /api/images/:id - Serve images from database', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    db.closeDb();
  });

  it('should serve image from database', async () => {
    const imageData = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG header
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

  it('should return 404 for non-existent image', async () => {
    db.getImageById.mockReturnValue(null);

    await request(app)
      .get('/api/images/999')
      .expect(404);
  });

  it('should reject invalid image ID', async () => {
    await request(app)
      .get('/api/images/abc')
      .expect(400);
  });

  it('should reject negative image ID', async () => {
    await request(app)
      .get('/api/images/-1')
      .expect(400);
  });
});