import React from 'react';

const StationControls = ({ schedule, onCorrect }) => {
  return (
    <div className="station-controls">
      <h3>PANEL KOREKTY</h3>
      {schedule.map(train => (
          <div key={train.id} className="control-row">
              <p>{train.destination} ({train.time})</p>
              {train.destination === "Z̶͜͠Ö̸̎Ṅ̶͘A̶̅̏" && (
                  <button onClick={() => onCorrect(train.id, 'destination')}>KORYGUJ KIERUNEK</button>
              )}
              {train.time === "99:99" && (
                  <button onClick={() => onCorrect(train.id, 'time')}>KORYGUJ CZAS</button>
              )}
              {/* Dodaj więcej kontroli w miarę potrzeb */}
          </div>
      ))}
    </div>
  );
};

export default StationControls;
