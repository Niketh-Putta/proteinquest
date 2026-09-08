import { Camera, Check, Flame, Sparkles, ArrowUpRight } from 'lucide-react';
import './reward-story.css';

export function RewardStory({ page }: { page: number }) {
  return <section className="reward-story">
    <span className="reward-eyebrow">{page === 1 ? 'BUILT FOR THE COMEBACK' : 'WHY PROTEINQUEST?'}</span>
    <h1>{page === 1 ? <>Make progress.<br/><em>Feel the win.</em></> : <>Your food tracker.<br/><em>With a reason to return.</em></>}</h1>
    {page === 1 ? <p>You know your goal. Let’s make showing up for it feel good.</p> : <div className="competitor-copy">
      <p><b>Cal AI</b> might help you scan meals.</p>
      <p><b>MyFitnessPal</b> might help you track nutrition.</p>
      <p className="proteinquest-copy"><b>ProteinQuest</b> will make you want to return by turning every meal into progress for your dragon.</p>
    </div>}
    {page === 1 ? <div className="reward-scene">
      <div className="reward-meal"><Camera size={23}/><div><b>Meal logged</b><small>One small action. Real momentum.</small></div><strong>+32<span>g protein</span></strong></div>
      <div className="reward-connector"/>
      <div className="reward-centre"><div className="reward-complete"><span><Check size={29} strokeWidth={2.5}/></span><b>Goal hit.</b><small>You showed up.</small></div><span className="reward-pop"><Sparkles size={16}/> WIN UNLOCKED</span></div>
      <div className="reward-streak"><Flame size={22}/><div><b>Your streak grows.</b><small>So does your dragon.</small></div><ArrowUpRight size={23}/></div>
      <div className="reward-days">{['M','T','W','T','F','S','S'].map((d,i)=><div key={i} style={{animationDelay:`${1.3+i*.12}s`}}><span><Check size={15}/></span><small>{d}</small></div>)}</div>
    </div> : <>
      <div className="comparison-chart"><div className="chart-heading"><span>THE ROUTINE WE’RE BUILDING</span><Flame size={19}/></div>
        <svg viewBox="0 0 320 240" role="img" aria-label="Illustration: momentum rising with rewarding tracking and fading when tracking feels unrewarding. Not measured app results.">
          <defs><linearGradient id="reward-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#db8753" stopOpacity=".24"/><stop offset="1" stopColor="#db8753" stopOpacity="0"/></linearGradient></defs>
          <path d="M18 62H302M18 126H302M18 190H302" stroke="#e6dfe5" strokeDasharray="3 5" fill="none"/>
          <path className="chart-area" d="M18 142 C80 145 102 115 150 89 S238 37 302 30 V209H18Z" fill="url(#reward-area)"/>
          <path className="chart-line chart-dull" pathLength="1" d="M18 142 C75 136 100 153 146 173 S244 207 302 207"/>
          <path className="chart-line chart-reward" pathLength="1" d="M18 142 C80 145 102 115 150 89 S238 37 302 30"/>
          <circle cx="18" cy="142" r="5" fill="white" stroke="#242026" strokeWidth="2"/>
          <circle className="chart-dot" cx="302" cy="30" r="5" fill="white" stroke="#bf7246" strokeWidth="2.5"/>
          <circle className="chart-dot" cx="302" cy="207" r="4" fill="white" stroke="#aaa0ac" strokeWidth="2"/>
          <text x="151" y="17" className="chart-label chart-label-best">Rewarding tracking</text>
          <text x="134" y="227" className="chart-label">When tracking feels empty</text>
        </svg>
        <div className="chart-axis"><span>Getting started</span><span>Building a habit</span></div>
        <p className="chart-caption">Illustrative momentum, not measured outcomes or a comparison of app performance.</p>
      </div>
      <div className="comparison-payoff"><div><b>Turn nutrition into a quest.</b><p>Scan → hit your goal → build a streak → level your dragon.</p></div></div>
      <p className="comparison-fair">The difference is the experience: your effort becomes visible progress for your dragon.</p>
    </>}
    <p className="story-bottom">{page===1?'A meal becomes a win. A win becomes a reason to come back.':'Choose the routine you’ll want to keep.'}</p>
    <div className="story-dots" aria-label={`Screen ${page} of 2`}><i className={page===1?'active':''}/><i className={page===2?'active':''}/></div>
  </section>;
}
