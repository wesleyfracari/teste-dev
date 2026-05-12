import { Controller, Get, Param } from '@nestjs/common';
import { CepService } from './cep.service';
import { CepResponseDto } from './dto/cep-response.dto';
import { CepValidationPipe } from './pipes/cep-validation.pipe';

@Controller('cep')
export class CepController {
  constructor(private readonly cepService: CepService) {}

  @Get(':cep')
  async findOne(
    @Param('cep', CepValidationPipe) cep: string,
  ): Promise<CepResponseDto> {
    return this.cepService.findByCep(cep);
  }
}
