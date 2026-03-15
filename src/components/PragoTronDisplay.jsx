import React from 'react';
import PragoSplitFlap from './PragoSplitFlap'; // Zakładamy ten komponent

const PragoTronDisplay = ({ schedule }) => {
  return (
    <div className="pragotron-board">
      <div className="pragotron-header">
        <span>GODZINA</span>
        <span>KIERUNEK</span>
        <span>PERON</span>
        <span>OPÓŹN.</span>
      </div>
      {schedule.map(train => (
        <div key={train.id} className="pragotron-row">
          <PragoSplitFlap text={train.time} length={5} />
          <PragoSplitFlap text={train.destination} length={12} isText={true} />
          <PragoSplitFlap text={train.platform.toString()} length={1} />
          <PragoSplitFlap text={train.delay.toString()} length={2} isDelay={true}/>
        </div>
      ))}
    </div>
  );
};

export default PragoTronDisplay;
