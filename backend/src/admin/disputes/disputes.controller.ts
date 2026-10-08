import { Controller, Get, Query, UseGuards, Param, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../admin-auth.guard';
import { ListDisputesDto } from './dto/list-disputes.dto';
import { DisputesService } from './disputes.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/disputes')
@UseGuards(AdminAuthGuard)
export class DisputesController {
  constructor(private readonly queue: DisputesService) {}

  @Get('queue')
  @ApiOperation({ summary: 'The review queue (default: open).' })
  list(@Query() query: ListDisputesDto): ReturnType<DisputesService['list']> {
    return this.queue.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific dispute details.' })
  async get(@Param('id') id: string) {
    const dispute = await this.queue.get(id);
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }
    return dispute;
  }
}
