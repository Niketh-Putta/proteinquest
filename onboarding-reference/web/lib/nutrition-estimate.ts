/** Starting estimates for adults, not a prediction of weight-loss speed.
 * Protein: ISSN position stand https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/
 * Energy: Mifflin–St Jeor resting estimate with an activity multiplier.
 */
export function nutritionEstimate(p: {
 age:number; heightCm:number; weightKg:number; targetKg:number;
 sex:string; activity:string; goal:string; pace:number;
}) {
 if (![p.age,p.heightCm,p.weightKg,p.targetKg,p.pace].every(Number.isFinite) ||
 p.age<18 || p.age>120 || p.heightCm<100 || p.heightCm>250 ||
 p.weightKg<25 || p.weightKg>350 || p.targetKg<25 || p.targetKg>350 ||
 p.pace<0 || p.pace>1) throw new Error('Check your age, height, weights and weekly pace. Adult estimates only.');
 const factors:Record<string,number>={sedentary:1.2,light:1.375,moderate:1.55,active:1.725,athlete:1.9};
 const maintenance=(10*p.weightKg+6.25*p.heightCm-5*p.age+(p.sex==='female'?-161:p.sex==='male'?5:-78))*(factors[p.activity]||1.375);
 const reached=(p.goal==='lose_fat'&&p.weightKg<=p.targetKg)||(p.goal==='build_muscle'&&p.weightKg>=p.targetKg);
 // Bound the initial adjustment; the static energy conversion is not a timeline guarantee.
 const adjustment=reached?0:p.goal==='lose_fat'?-Math.min(500,maintenance*.2,p.pace*1100):
 p.goal==='build_muscle'?Math.min(300,maintenance*.15,p.pace*1100):0;
 const calories=Math.round(Math.max(p.sex==='female'?1200:1500,maintenance+adjustment)/10)*10;
 const multiplier=p.activity==='sedentary'?1.2:p.goal==='lose_fat'?2:1.6;
 return {calories,protein:Math.round(Math.min(250,Math.max(45,p.weightKg*multiplier)))};
}

