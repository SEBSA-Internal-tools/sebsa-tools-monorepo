import { IsArray, IsUUID } from "class-validator";

export class TaskLabelsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  labelIds!: string[];
}