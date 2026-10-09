'use client';

import { useState, useCallback } from 'react';

export type GeolocationStatus =
  | 'IDLE'
  | 'ACQUIRING'
  | 'SUCCESS'
  | 'PERMISSION_DENIED'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'LOW_ACCURACY';

export interface GeolocationPositionData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface GeolocationState {
  status: GeolocationStatus;
  position: GeolocationPositionData | null;
  errorMessage: string | null;
  isAcquiring: boolean;
}

export function useGeolocation(maxAccuracyMeters: number = 100) {
  const [state, setState] = useState<GeolocationState>({
    status: 'IDLE',
    position: null,
    errorMessage: null,
    isAcquiring: false,
  });

  const acquireLocation = useCallback((): Promise<GeolocationPositionData> => {
    return new Promise((resolve, reject) => {
      if (!navigator || !navigator.geolocation) {
        const err = 'Geolocation is not supported by your browser.';
        setState({
          status: 'UNAVAILABLE',
          position: null,
          errorMessage: err,
          isAcquiring: false,
        });
        return reject(new Error(err));
      }

      setState((prev) => ({
        ...prev,
        status: 'ACQUIRING',
        isAcquiring: true,
        errorMessage: null,
      }));

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const data: GeolocationPositionData = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            timestamp: pos.timestamp || Date.now(),
          };

          if (data.accuracy > maxAccuracyMeters) {
            const warning = `GPS accuracy is low (${data.accuracy}m > ${maxAccuracyMeters}m limit). Please move to an open area or enable Wi-Fi.`;
            setState({
              status: 'LOW_ACCURACY',
              position: data,
              errorMessage: warning,
              isAcquiring: false,
            });
            resolve(data);
            return;
          }

          setState({
            status: 'SUCCESS',
            position: data,
            errorMessage: null,
            isAcquiring: false,
          });
          resolve(data);
        },
        (err) => {
          let status: GeolocationStatus = 'UNAVAILABLE';
          let message = 'Unable to retrieve location.';

          switch (err.code) {
            case err.PERMISSION_DENIED:
              status = 'PERMISSION_DENIED';
              message =
                'Location access was denied. Please allow location permissions in your browser address bar.';
              break;
            case err.POSITION_UNAVAILABLE:
              status = 'UNAVAILABLE';
              message = 'GPS position unavailable. Ensure device location services are turned on.';
              break;
            case err.TIMEOUT:
              status = 'TIMEOUT';
              message = 'GPS location request timed out. Please try again.';
              break;
          }

          setState({
            status,
            position: null,
            errorMessage: message,
            isAcquiring: false,
          });
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 10000,
        },
      );
    });
  }, [maxAccuracyMeters]);

  const reset = useCallback(() => {
    setState({
      status: 'IDLE',
      position: null,
      errorMessage: null,
      isAcquiring: false,
    });
  }, []);

  return {
    ...state,
    acquireLocation,
    reset,
  };
}
