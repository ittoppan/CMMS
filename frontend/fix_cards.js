const fs = require('fs');
let content = fs.readFileSync('app/(dashboard)/dashboard/page.tsx', 'utf8');

// 1. KPI Cards (White bg)
content = content.replace(/<div className="bg-white\/80 dark:bg-slate-800\/80 backdrop-blur-xl border border-white\/20 dark:border-slate-700\/50 shadow-lg shadow-[^\"]*transition-all duration-300 hover:[^\"]*p-5 rounded-2xl space-y-2 relative overflow-hidden group[^"]*">/g, '<Card elevation="low" padding={5} style={{ position: "relative", overflow: "hidden" }}>');

// 2. KPI Cards (Gradients)
content = content.replace(/<div className="bg-gradient-to-br from-[^\"]*backdrop-blur-lg border border-white\/20 shadow-xl shadow-[^\"]*text-white transition-all duration-300 hover:[^\"]*p-5 rounded-2xl space-y-2 relative overflow-hidden group[^"]*">/g, '<Card elevation="low" padding={5} style={{ position: "relative", overflow: "hidden" }}>');

// 3. Main Chart Widgets (White bg)
content = content.replace(/<div className="bg-white\/80 dark:bg-slate-800\/80 backdrop-blur-xl border border-white\/20 dark:border-slate-700\/50 shadow-lg shadow-[^\"]*rounded-2xl p-6 relative overflow-hidden transition-all duration-300 hover:[^\"]*">/g, '<Card elevation="low" padding={6} style={{ position: "relative", overflow: "hidden" }}>');

// 4. Secondary Grid Widgets (Gradients)
content = content.replace(/<div className="bg-gradient-to-br from-[^\"]*backdrop-blur-xl shadow-xl shadow-[^\"]*text-white rounded-2xl p-6 relative overflow-hidden transition-all duration-300 hover:[^\"]*">/g, '<Card elevation="low" padding={6} style={{ position: "relative", overflow: "hidden" }}>');

// 5. Date Toolbar
content = content.replace(/<div className="bg-white\/80 dark:bg-slate-800\/80 backdrop-blur-xl border border-white\/20 dark:border-slate-700\/50 shadow-lg shadow-[^\"]*rounded-2xl p-4 relative overflow-hidden transition-all duration-300">/g, '<Card elevation="low" padding={4}>');

// 6. Header
content = content.replace(/<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-white\/20 mt-2 bg-white\/70 dark:bg-slate-900\/70 backdrop-blur-md rounded-2xl p-6 relative overflow-hidden shadow-sm">/g, '<Card elevation="low" padding={6} className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">');

// 7. Predictive Alerts
content = content.replace(/<div key=\{\pred-\$\{idx\}\\} className="bg-gradient-to-r from-[^\"]*rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden cmms-animate-fadeInUp mb-2">/g, '<Card key={pred-} elevation="low" padding={4} className="mb-2 flex items-center gap-4" style={{ position: "relative", overflow: "hidden" }}>');

// Replace all </div> that close these wrappers. Since they wrap <VStack>, it's safer to just do a manual replace or ensure closing tags match. 
// Actually, regex to match matching </div> is hard in JS without an AST parser.
// Let's use string replacements where we know exactly where the closing divs are.

fs.writeFileSync('app/(dashboard)/dashboard/page.tsx', content);
console.log('Replaced wrappers.');
