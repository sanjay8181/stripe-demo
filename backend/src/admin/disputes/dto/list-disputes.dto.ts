import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}

export class ListDisputesDto extends PaginationDto {
  @IsOptional()
  @IsIn(['open', 'resolved', 'all'])
  status: 'open' | 'resolved' | 'all' = 'open';
}
