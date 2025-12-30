import React, { useEffect, useRef } from 'react';
import bgMusic from '../src/assets/audio/Warfront of Ash and Iron (1).mp3';

interface BackgroundMusicProps {
  enabled: boolean;
}

/**
 * BackgroundMusic: Manages looping background audio.
 * - Initializes an `<audio>` element once and attempts autoplay.
 * - Resumes playback on first user interaction if policy blocks autoplay.
 * - Reacts to `enabled` prop without resetting track position.
 */
export const BackgroundMusic: React.FC<BackgroundMusicProps> = ({ enabled }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio once and attempt autoplay
  // Initialize audio and try autoplay; attach interaction fallbacks
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio(bgMusic);
      audio.loop = true;
      audio.volume = 0.5;
      audioRef.current = audio;
    }
    const audio = audioRef.current!;

    const resumePlayback = () => {
      audio.play().catch(() => {
        // If still blocked, do nothing; user may interact again
      });
      document.removeEventListener('click', resumePlayback);
      document.removeEventListener('keydown', resumePlayback);
      document.removeEventListener('touchstart', resumePlayback);
    };

    // Try autoplay on mount
    audio.play().catch(() => {
      // Autoplay blocked; start after first user interaction
      document.addEventListener('click', resumePlayback, { once: true });
      document.addEventListener('keydown', resumePlayback, { once: true });
      document.addEventListener('touchstart', resumePlayback, { once: true });
    });

    return () => {
      // Cleanup: pause audio and remove listeners
      audio.pause();
      document.removeEventListener('click', resumePlayback);
      document.removeEventListener('keydown', resumePlayback);
      document.removeEventListener('touchstart', resumePlayback);
    };
  }, []);

  // React to enabled prop without resetting track position
  // Toggle play/pause when `enabled` changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (enabled) {
      audio.play().catch(() => {
        // If play fails due to policy, user interaction handler from mount will handle
      });
    } else {
      audio.pause();
    }
  }, [enabled]);

  return null;
};
