"use client";

import { useState, useEffect, useCallback } from "react";

export interface DeviceState {
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  selectedMic: string;
  selectedSpeaker: string;
}

export function useDevices() {
  const [devices, setDevices] = useState<DeviceState>({
    microphones: [],
    speakers: [],
    selectedMic: "default",
    selectedSpeaker: "default",
  });

  const getDevices = useCallback(async () => {
    try {
      // Prompt for permission if not already granted so labels are visible
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
        s.getTracks().forEach((t) => t.stop());
      }).catch(() => {
        // Ignore if denied or no devices
      });

      const enumeratedDevices = await navigator.mediaDevices.enumerateDevices();
      
      const microphones = enumeratedDevices.filter(d => d.kind === "audioinput");
      const speakers = enumeratedDevices.filter(d => d.kind === "audiooutput");

      const defaultMic = microphones.find(d => d.deviceId === 'default' || d.label.toLowerCase().includes('default')) || microphones[0];
      const defaultSpeaker = speakers.find(d => d.deviceId === 'default' || d.label.toLowerCase().includes('default')) || speakers[0];

      setDevices(prev => ({
        ...prev,
        microphones,
        speakers,
        selectedMic: prev.selectedMic === "default" && defaultMic ? defaultMic.deviceId : prev.selectedMic,
        selectedSpeaker: prev.selectedSpeaker === "default" && defaultSpeaker ? defaultSpeaker.deviceId : prev.selectedSpeaker
      }));
    } catch (err) {
      console.error("[useDevices] Failed to enumerate devices", err);
    }
  }, []);

  useEffect(() => {
    getDevices();
    navigator.mediaDevices.addEventListener("devicechange", getDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", getDevices);
    };
  }, [getDevices]);

  const selectMic = useCallback((deviceId: string) => {
    setDevices(prev => ({ ...prev, selectedMic: deviceId }));
  }, []);

  const selectSpeaker = useCallback((deviceId: string) => {
    setDevices(prev => ({ ...prev, selectedSpeaker: deviceId }));
  }, []);

  return {
    ...devices,
    selectMic,
    selectSpeaker,
    refreshDevices: getDevices
  };
}
