import { Module } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { AdminController } from './admin.controller';
import { AdminMenuService } from './admin-menu.service';
import { AdminTablesService } from './admin-tables.service';
import { AdminStaffService } from './admin-staff.service';
import { AdminSettingsService } from './admin-settings.service';

@Module({
  controllers: [AdminController],
  providers: [StorageService, AdminMenuService, AdminTablesService, AdminStaffService, AdminSettingsService],
})
export class AdminModule {}
