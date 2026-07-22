/** Hours since last logged meal → how hungry the dragon feels. */

export type HungerLevel = 0 | 1 | 2 | 3;

/** Fed / peckish / hungry / starved breakpoints (hours). */
export const HUNGER_HOURS = { peckish: 3, hungry: 6, starved: 10 } as const;

export function hoursSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now - t) / 3_600_000);
}

export function hungerFromLastMealAt(
  lastMealAt: string | null | undefined,
  now = Date.now(),
): HungerLevel {
  const hours = hoursSince(lastMealAt, now);
  if (hours == null) return 3;
  if (hours < HUNGER_HOURS.peckish) return 0;
  if (hours < HUNGER_HOURS.hungry) return 1;
  if (hours < HUNGER_HOURS.starved) return 2;
  return 3;
}

export function hungerLabel(level: HungerLevel): string {
  switch (level) {
    case 0:
      return 'Fed';
    case 1:
      return 'Peckish';
    case 2:
      return 'Hungry';
    case 3:
      return 'Starving';
  }
}

export function hungerHint(level: HungerLevel, dragonName: string): string {
  switch (level) {
    case 0:
      return `${dragonName} is full. Keep the streak alive`;
    case 1:
      return `${dragonName} is getting peckish`;
    case 2:
      return `${dragonName} is hungry. Scan a meal`;
    case 3:
      return `${dragonName} is starving. Feed them now`;
  }
}

/** First-person line from the dragon (mood hero copy). */
export function hungerVoice(level: HungerLevel, trainerName?: string | null): string {
  const you = trainerName?.trim() || 'trainer';
  switch (level) {
    case 0:
      return `Mmm… full and cozy, ${you}.`;
    case 1:
      return `Tummy’s whispering for a snack…`;
    case 2:
      return `I’m fading. I need a meal soon.`;
    case 3:
      return `I’m dim without food, ${you}. Please feed me.`;
  }
}

/** Tiny scene caption when the art is dimmed from hunger. */
export function hungerSceneCaption(level: HungerLevel): string | null {
  if (level <= 0) return null;
  if (level === 1) return 'getting hungry';
  if (level === 2) return 'dim · needs food';
  return 'fading · empty tummy';
}

/** Scene art opacity by hunger (1 = full, lower = dimmer). */
export function hungerArtOpacity(level: HungerLevel): number {
  return [1, 0.9, 0.68, 0.48][level] ?? 1;
}

/** Glow multiplier on top of micro.glowOpacity. */
export function hungerGlowMul(level: HungerLevel): number {
  return [1.25, 0.7, 0.35, 0.12][level] ?? 1;
}

/** Breath cycle length ms — starving breathes slower. */
export function hungerBreathMs(level: HungerLevel): number {
  return [3200, 3600, 4800, 6200][level] ?? 3600;
}
