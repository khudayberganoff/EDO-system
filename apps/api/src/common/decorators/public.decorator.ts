import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Login kabi autentifikatsiya talab qilmaydigan endpointlarga qo'llaniladi.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
