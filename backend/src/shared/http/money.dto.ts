import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class MoneyDto {
  @ApiProperty({ example: "25.00" })
  @IsString()
  @Matches(/^\d+\.\d{2}$/, { message: "amount must be a 2-decimal string" })
  amount!: string;

  @ApiProperty({ example: "BRL" })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}
