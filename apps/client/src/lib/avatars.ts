export const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐙', '🦄', '🐧', '🐯', '🐨', '🦉', '🐢', '🐝', '👾', '🤖', '👻', '🎃'];
export const avatarOf = (n: number) => AVATARS[n % AVATARS.length]!;
