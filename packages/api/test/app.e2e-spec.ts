import { Test } from '@nestjs/testing';
import { AppModule } from './../src/app.module';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';

const TEST_API_KEY = 'ephops-test-key';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

  beforeAll(async () => {
    process.env['API_KEY'] = TEST_API_KEY;

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /sandbox', () => {
    it('should return 401 without API key', () => {
      return request(httpServer).get('/sandbox').expect(401);
    });

    it('should return 200 with valid API key', () => {
      return request(httpServer)
        .get('/sandbox')
        .set('X-API-KEY', TEST_API_KEY)
        .expect(200);
    });
  });

  describe('POST /sandbox', () => {
    it('should return 401 without API key', () => {
      return request(httpServer)
        .post('/sandbox')
        .send({ prompt: 'Test' })
        .expect(401);
    });

    it('should reject invalid instance type', () => {
      return request(httpServer)
        .post('/sandbox')
        .set('X-API-KEY', TEST_API_KEY)
        .send({ prompt: 'Test', instanceType: 'm5.large' })
        .expect(400);
    });

    it('should reject missing prompt', () => {
      return request(httpServer)
        .post('/sandbox')
        .set('X-API-KEY', TEST_API_KEY)
        .send({ instanceType: 't3.micro' })
        .expect(400);
    });

    it('should reject TTL above max', () => {
      return request(httpServer)
        .post('/sandbox')
        .set('X-API-KEY', TEST_API_KEY)
        .send({ prompt: 'Test', ttlHours: 10 })
        .expect(400);
    });
  });

  describe('GET /action-logs', () => {
    it('should return 401 without API key', () => {
      return request(httpServer).get('/action-logs').expect(401);
    });

    it('should return 200 with valid API key', () => {
      return request(httpServer)
        .get('/action-logs')
        .set('X-API-KEY', TEST_API_KEY)
        .expect(200);
    });
  });

  describe('GET /health', () => {
    it('should return 200 without API key (public endpoint)', () => {
      return request(httpServer).get('/health').expect(200);
    });
  });
});
