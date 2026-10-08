import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { DisputesModule } from './admin/disputes/disputes.module';

@Module({
  imports: [DbModule, DisputesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
