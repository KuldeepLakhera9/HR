/**
 * Geofencing & Haversine Distance Calculation Utility
 * Pure TypeScript implementation without paid external map APIs
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface OfficeGeofenceTarget {
  id?: string;
  name?: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  timezone?: string;
  isActive?: boolean;
  effectiveFrom?: Date | string | null;
  effectiveTo?: Date | string | null;
}

export type GeofenceOutcome =
  'VERIFIED' | 'OUTSIDE_GEOFENCE' | 'LOW_ACCURACY' | 'STALE_LOCATION' | 'LOCATION_UNAVAILABLE';

export interface GeofenceEvaluationParams {
  clientLatitude: unknown;
  clientLongitude: unknown;
  clientAccuracyMeters?: unknown;
  clientTimestamp?: unknown;
  office: OfficeGeofenceTarget | null | undefined;
  maxAccuracyMeters?: number;
  maxSkewSeconds?: number;
  serverTime?: Date;
}

export interface GeofenceEvaluationResult {
  outcome: GeofenceOutcome;
  isWithinGeofence: boolean;
  distanceMeters: number | null;
  allowedRadiusMeters: number;
  accuracyMeters: number | null;
  timeSkewSeconds: number | null;
  message: string;
}

// Earth's mean radius in meters (WGS 84 standard)
const EARTH_RADIUS_METERS = 6371000;

/**
 * 1. Haversine distance formula between two geospatial coordinates (in meters)
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const toRad = (degrees: number) => (degrees * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = EARTH_RADIUS_METERS * c;
  return Math.round(distance * 100) / 100;
}

/**
 * 2. Validate latitude and longitude numerical boundaries
 */
export function validateCoordinates(
  lat: unknown,
  lon: unknown,
): { valid: boolean; error?: string } {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return { valid: false, error: 'Latitude and longitude coordinates are required.' };
  }

  const numLat = typeof lat === 'number' ? lat : Number(lat);
  const numLon = typeof lon === 'number' ? lon : Number(lon);

  if (Number.isNaN(numLat) || !Number.isFinite(numLat)) {
    return { valid: false, error: 'Latitude must be a valid finite number.' };
  }

  if (Number.isNaN(numLon) || !Number.isFinite(numLon)) {
    return { valid: false, error: 'Longitude must be a valid finite number.' };
  }

  if (numLat < -90 || numLat > 90) {
    return { valid: false, error: 'Latitude must be between -90 and +90 degrees.' };
  }

  if (numLon < -180 || numLon > 180) {
    return { valid: false, error: 'Longitude must be between -180 and +180 degrees.' };
  }

  return { valid: true };
}

/**
 * 3. Validate GPS device reported horizontal accuracy
 */
export function validateGpsAccuracy(
  accuracyMeters: unknown,
  maxAllowedThreshold: number = 100,
): { valid: boolean; error?: string; accuracy: number | null } {
  if (accuracyMeters === null || accuracyMeters === undefined || accuracyMeters === '') {
    // If client device doesn't supply accuracy, consider valid with null
    return { valid: true, accuracy: null };
  }

  const numAccuracy = typeof accuracyMeters === 'number' ? accuracyMeters : Number(accuracyMeters);

  if (Number.isNaN(numAccuracy) || !Number.isFinite(numAccuracy) || numAccuracy < 0) {
    return { valid: false, error: 'GPS accuracy must be a non-negative number.', accuracy: null };
  }

  if (numAccuracy > maxAllowedThreshold) {
    return {
      valid: false,
      error: `Reported GPS accuracy (${numAccuracy}m) exceeds acceptable threshold (${maxAllowedThreshold}m).`,
      accuracy: numAccuracy,
    };
  }

  return { valid: true, accuracy: numAccuracy };
}

/**
 * 4. Validate timestamp freshness against authoritative server clock
 */
export function validateTimestampFreshness(
  clientTimestamp: unknown,
  maxSkewSeconds: number = 60,
  serverTime: Date = new Date(),
): { valid: boolean; skewSeconds: number | null; error?: string } {
  if (!clientTimestamp) {
    return { valid: true, skewSeconds: null };
  }

  let clientDate: Date;
  if (clientTimestamp instanceof Date) {
    clientDate = clientTimestamp;
  } else if (typeof clientTimestamp === 'number') {
    clientDate = new Date(clientTimestamp);
  } else if (typeof clientTimestamp === 'string') {
    clientDate = new Date(clientTimestamp);
  } else {
    return { valid: false, skewSeconds: null, error: 'Invalid client timestamp format.' };
  }

  if (Number.isNaN(clientDate.getTime())) {
    return { valid: false, skewSeconds: null, error: 'Invalid timestamp date.' };
  }

  const diffMs = Math.abs(serverTime.getTime() - clientDate.getTime());
  const skewSeconds = Math.round(diffMs / 1000);

  if (skewSeconds > maxSkewSeconds) {
    return {
      valid: false,
      skewSeconds,
      error: `Client timestamp skew (${skewSeconds}s) exceeds allowable freshness window (${maxSkewSeconds}s).`,
    };
  }

  return { valid: true, skewSeconds };
}

/**
 * 5. Complete Geofence Evaluation Engine
 */
export function evaluateGeofenceLocation(
  params: GeofenceEvaluationParams,
): GeofenceEvaluationResult {
  const {
    clientLatitude,
    clientLongitude,
    clientAccuracyMeters,
    clientTimestamp,
    office,
    maxAccuracyMeters = 100,
    maxSkewSeconds = 60,
    serverTime = new Date(),
  } = params;

  // Step A: Verify Office Target Exists and is Active
  if (!office) {
    return {
      outcome: 'LOCATION_UNAVAILABLE',
      isWithinGeofence: false,
      distanceMeters: null,
      allowedRadiusMeters: 0,
      accuracyMeters: null,
      timeSkewSeconds: null,
      message: 'Office location not found or not assigned.',
    };
  }

  if (office.isActive === false) {
    return {
      outcome: 'LOCATION_UNAVAILABLE',
      isWithinGeofence: false,
      distanceMeters: null,
      allowedRadiusMeters: office.geofenceRadiusMeters || 100,
      accuracyMeters: null,
      timeSkewSeconds: null,
      message: 'Designated office location is inactive.',
    };
  }

  // Check effective dates if present
  if (office.effectiveFrom) {
    const effFrom = new Date(office.effectiveFrom);
    if (!Number.isNaN(effFrom.getTime()) && serverTime < effFrom) {
      return {
        outcome: 'LOCATION_UNAVAILABLE',
        isWithinGeofence: false,
        distanceMeters: null,
        allowedRadiusMeters: office.geofenceRadiusMeters || 100,
        accuracyMeters: null,
        timeSkewSeconds: null,
        message: 'Office location is not yet effective.',
      };
    }
  }

  if (office.effectiveTo) {
    const effTo = new Date(office.effectiveTo);
    if (!Number.isNaN(effTo.getTime()) && serverTime > effTo) {
      return {
        outcome: 'LOCATION_UNAVAILABLE',
        isWithinGeofence: false,
        distanceMeters: null,
        allowedRadiusMeters: office.geofenceRadiusMeters || 100,
        accuracyMeters: null,
        timeSkewSeconds: null,
        message: 'Office location effective period has expired.',
      };
    }
  }

  // Validate Office coordinates
  const officeCoordCheck = validateCoordinates(office.latitude, office.longitude);
  if (!officeCoordCheck.valid) {
    return {
      outcome: 'LOCATION_UNAVAILABLE',
      isWithinGeofence: false,
      distanceMeters: null,
      allowedRadiusMeters: office.geofenceRadiusMeters || 100,
      accuracyMeters: null,
      timeSkewSeconds: null,
      message: `Invalid office coordinates: ${officeCoordCheck.error}`,
    };
  }

  // Step B: Validate Client Coordinates
  const clientCoordCheck = validateCoordinates(clientLatitude, clientLongitude);
  if (!clientCoordCheck.valid) {
    return {
      outcome: 'LOCATION_UNAVAILABLE',
      isWithinGeofence: false,
      distanceMeters: null,
      allowedRadiusMeters: office.geofenceRadiusMeters || 100,
      accuracyMeters: null,
      timeSkewSeconds: null,
      message: `Invalid client coordinates: ${clientCoordCheck.error}`,
    };
  }

  const numClientLat = Number(clientLatitude);
  const numClientLon = Number(clientLongitude);

  // Step C: Validate Client Timestamp Freshness
  const freshnessCheck = validateTimestampFreshness(clientTimestamp, maxSkewSeconds, serverTime);
  if (!freshnessCheck.valid) {
    return {
      outcome: 'STALE_LOCATION',
      isWithinGeofence: false,
      distanceMeters: null,
      allowedRadiusMeters: office.geofenceRadiusMeters || 100,
      accuracyMeters: null,
      timeSkewSeconds: freshnessCheck.skewSeconds,
      message: freshnessCheck.error || 'Location timestamp is stale or manipulated.',
    };
  }

  // Step D: Validate GPS Accuracy
  const accuracyCheck = validateGpsAccuracy(clientAccuracyMeters, maxAccuracyMeters);
  if (!accuracyCheck.valid) {
    return {
      outcome: 'LOW_ACCURACY',
      isWithinGeofence: false,
      distanceMeters: null,
      allowedRadiusMeters: office.geofenceRadiusMeters || 100,
      accuracyMeters: accuracyCheck.accuracy,
      timeSkewSeconds: freshnessCheck.skewSeconds,
      message: accuracyCheck.error || 'Device GPS accuracy is insufficient for verification.',
    };
  }

  // Step E: Compute Haversine Distance
  const distanceMeters = haversineDistance(
    numClientLat,
    numClientLon,
    office.latitude,
    office.longitude,
  );

  const allowedRadius = office.geofenceRadiusMeters || 100;
  const isWithinGeofence = distanceMeters <= allowedRadius;

  if (isWithinGeofence) {
    return {
      outcome: 'VERIFIED',
      isWithinGeofence: true,
      distanceMeters,
      allowedRadiusMeters: allowedRadius,
      accuracyMeters: accuracyCheck.accuracy,
      timeSkewSeconds: freshnessCheck.skewSeconds,
      message: `Location successfully verified within ${distanceMeters}m of ${office.name || 'office'} (Radius: ${allowedRadius}m).`,
    };
  } else {
    return {
      outcome: 'OUTSIDE_GEOFENCE',
      isWithinGeofence: false,
      distanceMeters,
      allowedRadiusMeters: allowedRadius,
      accuracyMeters: accuracyCheck.accuracy,
      timeSkewSeconds: freshnessCheck.skewSeconds,
      message: `Location is ${distanceMeters}m away from ${office.name || 'office'}, exceeding allowed radius of ${allowedRadius}m.`,
    };
  }
}
