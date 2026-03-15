import React, { useState, useEffect, useRef } from 'react';

const characters = " ABCDEFGHIJKLMNOPQRSTUVWXYZŁÓŻĆŚĘĄ0123456789:-.Z̶͜͠Ö̸̎Ṅ̶͘A̶̅̏".split(""); // Dostępne znaki

const PragoSplitFlap = ({ text = "", length, isText = false }) => {
  const paddedText = text.padEnd(length, " ").toUpperCase();
  const flapRefs = useRef([]);

  useEffect(() => {
    // Tu logika animacji klapek przy zmianie tekstu
    // Każda zmiana paddedText powinna wyzwolić animację 'spin' dla odpowiednich klapek
    // To wymagałoby zaawansowanego CSS i ewentualnie biblioteki animacji lub czystego JS wewnątrz useEffect.
    // Dla uproszczenia tylko renderujemy statycznie.
  }, [paddedText]);

  return (
    <div className="split-flap-group">
      {paddedText.split("").map((char, index) => (
        <div key={index} className="flap" ref={el => flapRefs.current[index] = el}>
          <div className="flap-top">{char}</div>
          <div className="flap-bottom">{char}</div>
        </div>
      ))}
    </div>
  );
};

export default PragoSplitFlap;
