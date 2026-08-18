import { SetMetadata } from "@nestjs/common";
import { Role } from "../enums";

export const ROLES_KEY = "roles";

/**
 * Controller yoki route'ga qo'llaniladi: qaysi rollar shu endpointga kira oladi.
 * Masalan: @Roles(Role.ADMIN, Role.MANAGER)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
