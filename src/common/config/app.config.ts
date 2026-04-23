import { registerAs } from '@nestjs/config';

export interface AppConfig {
  nodeEnv: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsEndpoint: string;
  maxConcurrentEnvs: number;
  maxTtlHours: number;
}

export default registerAs(
  'app',
  (): AppConfig => ({
    nodeEnv: process.env['NODE_ENV'] ?? 'local',
    ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
    ollamaModel: process.env['OLLAMA_MODEL'] ?? 'llama3.2',
    awsRegion: process.env['AWS_REGION'] ?? 'us-east-1',
    awsAccessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? '',
    awsSecretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
    awsEndpoint: process.env['AWS_ENDPOINT'] ?? '',
    maxConcurrentEnvs: parseInt(process.env['MAX_CONCURRENT_ENVS'] ?? '2', 10),
    maxTtlHours: parseInt(process.env['MAX_TTL_HOURS'] ?? '2', 10),
  }),
);
