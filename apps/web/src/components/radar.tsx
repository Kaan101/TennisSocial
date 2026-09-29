"use client";

import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

export function SkillRadar({
  series,
}: {
  series: { name: string; color: string; data: { axis: string; value: number }[] }[];
}) {
  const axes = series[0]?.data ?? [];
  if (!axes.length) return null;
  const rows = axes.map((point, index) => {
    const row: Record<string, string | number> = { axis: point.axis };
    for (const item of series) row[item.name] = item.data[index]?.value ?? 0;
    return row;
  });
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={rows} outerRadius="68%">
          <PolarGrid stroke="#e0d8c8" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "#14241c", fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 10]} tick={{ fill: "#5d6b63", fontSize: 10 }} />
          {series.map((item) => (
            <Radar key={item.name} name={item.name} dataKey={item.name} stroke={item.color} fill={item.color} fillOpacity={0.28} />
          ))}
          {series.length > 1 ? <Legend /> : null}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
