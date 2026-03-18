/**
 * Calculate bearing (0–360°) from point A to point B
 */
export function calcBearing(prevLat: number, prevLon: number, lat: number, lon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(lon - prevLon);
  const y = Math.sin(dLon) * Math.cos(toRad(lat));
  const x =
    Math.cos(toRad(prevLat)) * Math.sin(toRad(lat)) -
    Math.sin(toRad(prevLat)) * Math.cos(toRad(lat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Get relative direction of ambulance from the user's perspective.
 * ambulanceBearing: where the ambulance is heading (degrees)
 * userHeading: which way the user is facing (degrees, from compass)
 */
export function getRelativeDirection(ambulanceBearing: number, userHeading: number): string {
  // Angle of ambulance relative to user's forward direction
  const relative = ((ambulanceBearing - userHeading) + 360) % 360;

  if (relative >= 315 || relative < 45)  return "Approaching from ahead";
  if (relative >= 45  && relative < 135) return "Approaching from your right";
  if (relative >= 135 && relative < 225) return "Approaching from behind";
  return "Approaching from your left";
}

/**
 * Direction arrow emoji to complement the text
 */
export function getDirectionArrow(ambulanceBearing: number, userHeading: number): string {
  const relative = ((ambulanceBearing - userHeading) + 360) % 360;
  if (relative >= 315 || relative < 45)  return "⬆️";
  if (relative >= 45  && relative < 135) return "➡️";
  if (relative >= 135 && relative < 225) return "⬇️";
  return "⬅️";
}