import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { AuthenticatedUser } from '../users/user.type.js';
import { ChatService } from './chat.service.js';
import { PaginationDto } from '../common/pagination.dto.js';
import {
  CreateChatDto,
  GetChatsDto,
  SendChatMessageDto,
} from './dto/chat.dto.js';

@Controller('chats')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateChatDto) {
    return this.chatService.createChat(user.id, dto.caseId, dto);
  }

  @Post('new')
  @HttpCode(HttpStatus.CREATED)
  createFromLegacyRoute(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateChatDto,
  ) {
    return this.chatService.createChat(user.id, dto.caseId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() dto: GetChatsDto) {
    return this.chatService.list(user.id, dto);
  }

  @Get(':chatId/documents')
  getChatDocuments(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.getChatDocuments(chatId, user.id);
  }

  @Get(':chatId')
  get(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.chatService.get(chatId, user.id, pagination);
  }

  @Post(':chatId/messages')
  sendMessage(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatService.addMessage(chatId, user.id, dto);
  }

  @Delete(':chatId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.chatService.deleteChat(chatId, user.id);
  }
}
