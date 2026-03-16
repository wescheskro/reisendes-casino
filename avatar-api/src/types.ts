export interface AvatarConfig {
  gender: string;
  skinColor: string;
  eyeColor: string;
  hairColor: string;
  parts: Record<string, string>;
}

export interface SaveAvatarRequest {
  gender?: string;
  skinColor?: string;
  eyeColor?: string;
  hairColor?: string;
  parts?: Record<string, string>;
  thumbnailDataUrl?: string;
}

export interface JwtPayload {
  userId: string;
  username: string;
}

export interface ApiError {
  error: string;
  hint?: string;
  min?: string;
  max?: string;
  retry_after?: number;
  position?: number;
  estimated_wait?: number;
}
