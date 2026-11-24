import { Controller, Get, Header, Param } from '@nestjs/common';
import type { PublicMenuDto } from '@qrmenu/shared';
import { PublicMenuService } from './public-menu.service';

/** Публичные эндпоинты гостя (без авторизации, доступ — по подписанному токену стола). */
@Controller('public')
export class PublicMenuController {
  constructor(private readonly menu: PublicMenuService) {}

  @Get('menu/:slug/:token')
  @Header('Cache-Control', 'no-store') // стоп-лист должен применяться сразу
  getMenu(@Param('slug') slug: string, @Param('token') token: string): Promise<PublicMenuDto> {
    return this.menu.getMenu(slug, token);
  }
}
