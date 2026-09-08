export function TrendChart({animate=true}:{animate?:boolean}) {
  const plan='M12 40 C72 40 99 43 129 65 C168 94 192 128 226 137 C244 140 253 140 274 140 L296 140';
  return <div className={'chart '+(animate?'chart-drawing':'')}>
    <svg viewBox="0 0 310 170" role="img" aria-label="Weight trend from Month 1 to Month 6: without a plan fluctuates; with ProteinQuest decreases and levels out.">
      <defs><linearGradient id="trend-shade" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d3d1d9" stopOpacity=".4"/><stop offset="1" stopColor="#f7f6fa" stopOpacity=".1"/></linearGradient></defs>
      {[40,85,130].map(y=><line key={y} x1="12" x2="298" y1={y} y2={y} stroke="#dfdde1" strokeDasharray="2 3"/>)}
      <path className="chart-area" d={`${plan} L296 151 L12 151Z`} fill="url(#trend-shade)"/>
      <path className="chart-stroke chart-comparison" pathLength="1" d="M12 40 C76 40 105 102 139 99 C169 98 181 64 218 35 C248 12 270 9 296 15" fill="none" stroke="#c97187" strokeWidth="2"/>
      <path className="chart-stroke" pathLength="1" d={plan} fill="none" stroke="#252229" strokeWidth="2"/>
      <text className="trend-line-label comparison-label" x="206" y="65" fill="#9b7c86" fontSize="10">Without a plan</text>
      <text className="trend-line-label plan-label" x="16" y="137" fill="#252229" fontSize="10" fontWeight="600">With ProteinQuest</text>
      <circle cx="12" cy="40" r="5" stroke="#252229" strokeWidth="2" fill="white"/>
      <circle className="chart-endpoint" cx="296" cy="140" r="5" stroke="#252229" strokeWidth="2" fill="white"/>
      <line x1="7" x2="302" y1="151" y2="151" stroke="#aaa"/>
    </svg>
    <div className="chart-labels"><span>Month 1</span><span>Month 6</span></div>
  </div>;
}
