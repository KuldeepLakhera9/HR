import {
  haversineDistance,
  validateCoordinates,
  validateGpsAccuracy,
  validateTimestampFreshness,
  evaluateGeofenceLocation,
  OfficeGeofenceTarget,
} from './geofence.util';

describe('Geofence & Haversine Utility', () => {
  describe('haversineDistance', () => {
    it('should return 0 meters for identical coordinates', () => {
      const distance = haversineDistance(12.9716, 77.5946, 12.9716, 77.5946);
      expect(distance).toBe(0);
    });

    it('should calculate accurate distance between two known points in Bengaluru', () => {
      // Point A: Vidhana Soudha (12.9797, 77.5907)
      // Point B: MG Road Metro Station (12.9756, 77.6066)
      // Expected distance is ~1780 meters (+/- 50m)
      const distance = haversineDistance(12.9797, 77.5907, 12.9756, 77.6066);
      expect(distance).toBeGreaterThan(1700);
      expect(distance).toBeLessThan(1850);
    });

    it('should calculate accurate distance across international coordinates', () => {
      // London (51.5074, -0.1278) to Paris (48.8566, 2.3522) ~ 343 km (343,000m)
      const distance = haversineDistance(51.5074, -0.1278, 48.8566, 2.3522);
      expect(distance).toBeGreaterThan(340000);
      expect(distance).toBeLessThan(350000);
    });

    it('should correctly measure antipodal or extreme boundary points', () => {
      // North pole (90, 0) to South pole (-90, 0) = half circumference ~ 20,015 km
      const distance = haversineDistance(90, 0, -90, 0);
      expect(distance).toBeGreaterThan(20000000);
      expect(distance).toBeLessThan(20050000);
    });
  });

  describe('validateCoordinates', () => {
    it('should validate legitimate global coordinates', () => {
      expect(validateCoordinates(12.9716, 77.5946).valid).toBe(true);
      expect(validateCoordinates(0, 0).valid).toBe(true);
      expect(validateCoordinates(90, 180).valid).toBe(true);
      expect(validateCoordinates(-90, -180).valid).toBe(true);
    });

    it('should accept string representations of numbers', () => {
      expect(validateCoordinates('12.9716', '77.5946').valid).toBe(true);
    });

    it('should reject coordinates exceeding latitude bounds (-90 to +90)', () => {
      expect(validateCoordinates(90.1, 77.5946).valid).toBe(false);
      expect(validateCoordinates(-91, 77.5946).valid).toBe(false);
    });

    it('should reject coordinates exceeding longitude bounds (-180 to +180)', () => {
      expect(validateCoordinates(12.9716, 180.5).valid).toBe(false);
      expect(validateCoordinates(12.9716, -181).valid).toBe(false);
    });

    it('should reject NaN, infinity, null, or undefined coordinates', () => {
      expect(validateCoordinates(NaN, 77.5946).valid).toBe(false);
      expect(validateCoordinates(12.9716, Infinity).valid).toBe(false);
      expect(validateCoordinates(null, 77.5946).valid).toBe(false);
      expect(validateCoordinates(12.9716, undefined).valid).toBe(false);
      expect(validateCoordinates('invalid', 77.5946).valid).toBe(false);
    });
  });

  describe('validateGpsAccuracy', () => {
    it('should accept valid accuracy within default 100m threshold', () => {
      const res = validateGpsAccuracy(15, 100);
      expect(res.valid).toBe(true);
      expect(res.accuracy).toBe(15);
    });

    it('should allow boundary accuracy equal to threshold', () => {
      const res = validateGpsAccuracy(100, 100);
      expect(res.valid).toBe(true);
      expect(res.accuracy).toBe(100);
    });

    it('should reject accuracy exceeding threshold with LOW_ACCURACY cause', () => {
      const res = validateGpsAccuracy(105, 100);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('exceeds acceptable threshold');
    });

    it('should reject negative accuracy values', () => {
      const res = validateGpsAccuracy(-5, 100);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('non-negative');
    });

    it('should allow null or undefined accuracy as unstated', () => {
      const res = validateGpsAccuracy(null);
      expect(res.valid).toBe(true);
      expect(res.accuracy).toBeNull();
    });
  });

  describe('validateTimestampFreshness', () => {
    const fixedNow = new Date('2026-10-09T10:00:00.000Z');

    it('should accept timestamps within 60s freshness skew', () => {
      const clientTime = new Date('2026-10-09T09:59:45.000Z'); // 15s ago
      const res = validateTimestampFreshness(clientTime, 60, fixedNow);
      expect(res.valid).toBe(true);
      expect(res.skewSeconds).toBe(15);
    });

    it('should accept exact boundary timestamp (60s)', () => {
      const clientTime = new Date('2026-10-09T09:59:00.000Z'); // 60s ago
      const res = validateTimestampFreshness(clientTime, 60, fixedNow);
      expect(res.valid).toBe(true);
      expect(res.skewSeconds).toBe(60);
    });

    it('should reject stale timestamp older than 60s', () => {
      const clientTime = new Date('2026-10-09T09:58:30.000Z'); // 90s ago
      const res = validateTimestampFreshness(clientTime, 60, fixedNow);
      expect(res.valid).toBe(false);
      expect(res.skewSeconds).toBe(90);
      expect(res.error).toContain('exceeds allowable freshness window');
    });

    it('should reject future timestamps with skew exceeding 60s', () => {
      const clientTime = new Date('2026-10-09T10:02:00.000Z'); // 120s into future
      const res = validateTimestampFreshness(clientTime, 60, fixedNow);
      expect(res.valid).toBe(false);
      expect(res.skewSeconds).toBe(120);
    });

    it('should gracefully handle empty timestamp', () => {
      const res = validateTimestampFreshness(undefined, 60, fixedNow);
      expect(res.valid).toBe(true);
      expect(res.skewSeconds).toBeNull();
    });
  });

  describe('evaluateGeofenceLocation (Full Pipeline)', () => {
    const mockOffice: OfficeGeofenceTarget = {
      id: 'off-1',
      name: 'Bengaluru Tech Park',
      latitude: 12.9716,
      longitude: 77.5946,
      geofenceRadiusMeters: 100,
      timezone: 'Asia/Kolkata',
      isActive: true,
    };

    const fixedServerTime = new Date('2026-10-09T10:00:00.000Z');

    it('should return VERIFIED when user is at office center', () => {
      const res = evaluateGeofenceLocation({
        clientLatitude: 12.9716,
        clientLongitude: 77.5946,
        clientAccuracyMeters: 15,
        clientTimestamp: fixedServerTime,
        office: mockOffice,
        serverTime: fixedServerTime,
      });

      expect(res.outcome).toBe('VERIFIED');
      expect(res.isWithinGeofence).toBe(true);
      expect(res.distanceMeters).toBe(0);
    });

    it('should return VERIFIED when user is 50m away inside 100m radius', () => {
      // 0.0004 degrees latitude is ~44.5 meters
      const res = evaluateGeofenceLocation({
        clientLatitude: 12.9716 + 0.0004,
        clientLongitude: 77.5946,
        clientAccuracyMeters: 20,
        clientTimestamp: fixedServerTime,
        office: mockOffice,
        serverTime: fixedServerTime,
      });

      expect(res.outcome).toBe('VERIFIED');
      expect(res.isWithinGeofence).toBe(true);
      expect(res.distanceMeters).toBeLessThan(100);
    });

    it('should return OUTSIDE_GEOFENCE when user is 250m away', () => {
      // 0.0025 degrees latitude is ~278 meters
      const res = evaluateGeofenceLocation({
        clientLatitude: 12.9716 + 0.0025,
        clientLongitude: 77.5946,
        clientAccuracyMeters: 10,
        clientTimestamp: fixedServerTime,
        office: mockOffice,
        serverTime: fixedServerTime,
      });

      expect(res.outcome).toBe('OUTSIDE_GEOFENCE');
      expect(res.isWithinGeofence).toBe(false);
      expect(res.distanceMeters).toBeGreaterThan(100);
      expect(res.message).toContain('exceeding allowed radius of 100m');
    });

    it('should return LOW_ACCURACY when GPS accuracy exceeds 100m', () => {
      const res = evaluateGeofenceLocation({
        clientLatitude: 12.9716,
        clientLongitude: 77.5946,
        clientAccuracyMeters: 180, // Poor cellular triangulation
        clientTimestamp: fixedServerTime,
        office: mockOffice,
        serverTime: fixedServerTime,
      });

      expect(res.outcome).toBe('LOW_ACCURACY');
      expect(res.isWithinGeofence).toBe(false);
      expect(res.message).toContain('exceeds acceptable threshold');
    });

    it('should return STALE_LOCATION when timestamp skew exceeds 60s', () => {
      const staleTime = new Date('2026-10-09T09:50:00.000Z'); // 10 minutes ago
      const res = evaluateGeofenceLocation({
        clientLatitude: 12.9716,
        clientLongitude: 77.5946,
        clientAccuracyMeters: 15,
        clientTimestamp: staleTime,
        office: mockOffice,
        serverTime: fixedServerTime,
      });

      expect(res.outcome).toBe('STALE_LOCATION');
      expect(res.isWithinGeofence).toBe(false);
      expect(res.message).toContain('timestamp skew');
    });

    it('should return LOCATION_UNAVAILABLE when office is missing', () => {
      const res = evaluateGeofenceLocation({
        clientLatitude: 12.9716,
        clientLongitude: 77.5946,
        office: null,
      });

      expect(res.outcome).toBe('LOCATION_UNAVAILABLE');
      expect(res.isWithinGeofence).toBe(false);
    });

    it('should return LOCATION_UNAVAILABLE when office is inactive', () => {
      const res = evaluateGeofenceLocation({
        clientLatitude: 12.9716,
        clientLongitude: 77.5946,
        office: { ...mockOffice, isActive: false },
      });

      expect(res.outcome).toBe('LOCATION_UNAVAILABLE');
      expect(res.message).toContain('office location is inactive');
    });

    it('should return LOCATION_UNAVAILABLE when client coordinates are invalid', () => {
      const res = evaluateGeofenceLocation({
        clientLatitude: 'invalid-lat',
        clientLongitude: 77.5946,
        office: mockOffice,
      });

      expect(res.outcome).toBe('LOCATION_UNAVAILABLE');
      expect(res.message).toContain('Invalid client coordinates');
    });

    it('should return LOCATION_UNAVAILABLE when office coordinates are invalid', () => {
      const res = evaluateGeofenceLocation({
        clientLatitude: 12.9716,
        clientLongitude: 77.5946,
        office: { ...mockOffice, latitude: 150 }, // Lat > 90
      });

      expect(res.outcome).toBe('LOCATION_UNAVAILABLE');
      expect(res.message).toContain('Invalid office coordinates');
    });
  });
});
