import { UserDto } from "./models";
export interface LoginRequestDto {
    email: string;
    password: string;
    organizationId?: string;
}
export interface OrganizationDto {
    id: string;
    name: string;
}
export interface LoginOrgSelectionRequiredDto {
    requiresOrganizationSelection: true;
    organizations: OrganizationDto[];
}
export interface LoginSuccessDto {
    accessToken: string;
    user: UserDto;
}
export type LoginResponseDto = LoginSuccessDto | LoginOrgSelectionRequiredDto;
export interface JwtPayload {
    sub: string;
    email: string;
    role: string;
    organizationId: string;
}
