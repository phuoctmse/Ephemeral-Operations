import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Params } from 'nestjs-pino';
import type { Options } from 'pino-http';
import appConfig from '../config/app.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: ['.env'],
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Params => {
        const isDev = configService.get<string>('app.nodeEnv') !== 'production';
        const pinoHttp: Options = {
          level: isDev ? 'debug' : 'info',
        };
        if (isDev) {
          pinoHttp.transport = {
            target: 'pino-pretty',
            options: { colorize: true },
          };
        }
        return { pinoHttp };
      },
    }),
  ],
})
export class AppConfigModule {}
