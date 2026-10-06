import { TZDate } from "@date-fns/tz";

import { TIME_ZONE } from "@/lib/constants";

/**
 * Dates are stored in UTC and always displayed in TIME_ZONE. Vercel runs in UTC, so
 * formatting without an explicit zone shows the wrong hour. Brazil has no daylight
 * saving time any more, so building a local instant has no ambiguity.
 */

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const timeWithSecondsFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const shortFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "Quarta-feira, 08 de outubro às 20:00" */
export function formatGameDateTime(iso: string): string {
  const parts = dateTimeFormatter.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return capitalize(
    `${get("weekday")}, ${get("day")} de ${get("month")} às ${get("hour")}:${get("minute")}`,
  );
}

/** "Quarta-feira, 08 de outubro" */
export function formatGameDate(iso: string): string {
  return capitalize(dateFormatter.format(new Date(iso)).replace(",", ","));
}

/** "20:00" */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** "20:00:13" — the seconds are what settle the argument about who was first. */
export function formatTimeWithSeconds(iso: string): string {
  return timeWithSecondsFormatter.format(new Date(iso));
}

/** "08/10 20:00" */
export function formatShort(iso: string): string {
  return shortFormatter.format(new Date(iso));
}

/** "02:13:45", or "2d 03:04:05" when it is more than a day away. */
export function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const pad = (value: number) => String(value).padStart(2, "0");
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return days > 0 ? `${days}d ${clock}` : clock;
}

/**
 * TZDate#toISOString keeps the zone offset ("-03:00"). Everything leaving this module
 * is normalized to a Z string, so the app never mixes two instant formats.
 */
function toUtcIso(date: Date): string {
  return new Date(date.getTime()).toISOString();
}

function parseTime(time: string): [number, number] {
  const [hours, minutes] = time.split(":");
  return [Number(hours), Number(minutes ?? 0)];
}

/**
 * The next time `weekday` falls at `time` in TIME_ZONE, at or after `fromIso`.
 * weekday: 0 = Sunday .. 6 = Saturday.
 */
export function nextOccurrence(fromIso: string, weekday: number, time: string): string {
  const [hours, minutes] = parseTime(time);
  const from = new TZDate(fromIso, TIME_ZONE);

  const sameDay = new TZDate(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    hours,
    minutes,
    0,
    0,
    TIME_ZONE,
  );

  let delta = (weekday - sameDay.getDay() + 7) % 7;
  if (delta === 0 && sameDay.getTime() <= from.getTime()) delta = 7;

  return toUtcIso(
    new TZDate(
      from.getFullYear(),
      from.getMonth(),
      from.getDate() + delta,
      hours,
      minutes,
      0,
      0,
      TIME_ZONE,
    ),
  );
}

/** The last time `weekday` fell at `time` in TIME_ZONE, strictly before `beforeIso`. */
export function previousOccurrence(beforeIso: string, weekday: number, time: string): string {
  const [hours, minutes] = parseTime(time);
  const before = new TZDate(beforeIso, TIME_ZONE);

  let delta = (before.getDay() - weekday + 7) % 7;
  let candidate = new TZDate(
    before.getFullYear(),
    before.getMonth(),
    before.getDate() - delta,
    hours,
    minutes,
    0,
    0,
    TIME_ZONE,
  );

  if (candidate.getTime() >= before.getTime()) {
    delta += 7;
    candidate = new TZDate(
      before.getFullYear(),
      before.getMonth(),
      before.getDate() - delta,
      hours,
      minutes,
      0,
      0,
      TIME_ZONE,
    );
  }

  return toUtcIso(candidate);
}

/** UTC instant -> the value a `datetime-local` input expects, in TIME_ZONE. */
export function toDateTimeLocalValue(iso: string): string {
  const zoned = new TZDate(iso, TIME_ZONE);
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(zoned.getDate())}` +
    `T${pad(zoned.getHours())}:${pad(zoned.getMinutes())}`
  );
}

/** The value of a `datetime-local` input, read as TIME_ZONE, back to a UTC instant. */
export function fromDateTimeLocalValue(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) throw new Error(`Invalid datetime-local value: ${value}`);

  const [, year, month, day, hours, minutes] = match;

  return toUtcIso(
    new TZDate(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      0,
      0,
      TIME_ZONE,
    ),
  );
}
