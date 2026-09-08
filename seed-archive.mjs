import fs from "node:fs/promises";

const NEW = [
/* ---------- RELIGION & BELIEF (was thinnest) ---------- */
{t:"Indonesia jails a Christian governor for blasphemy", y:2017, r:"asia", c:["rel","pol","eth"],
 s:"Jakarta's governor Basuki Tjahaja Purnama, known as Ahok, was sentenced to two years for blasphemy after remarks about a Quranic verse, following mass demonstrations. The case was widely read as a turning point for religious politics in the world's largest Muslim-majority democracy.",
 u:"Shows blasphemy law functioning as a political weapon rather than a protection of belief, in a country that guarantees religious freedom on paper."},

{t:"India's states expand laws restricting religious conversion", y:2021, r:"asia", c:["rel","pol","eth"],
 s:"A growing number of Indian states passed or tightened anti-conversion laws requiring official notice before changing religion, framed as preventing coercion or marriage-based conversion. Critics argue they are used disproportionately against Christian and Muslim minorities and reverse the burden of proof.",
 u:"Useful for asking whether the state can protect religious freedom and regulate it at the same time."},

{t:"Saudi Arabia lifts its ban on women driving", y:2018, r:"asia", c:["rel","gen","pol"],
 s:"The kingdom ended the world's only ban on women driving as part of a package of social changes that also reopened cinemas and curbed the religious police. Several women who had campaigned for the change were detained around the same period.",
 u:"Complicates any simple story about reform: liberalisation delivered from above, while the people who demanded it were punished."},

{t:"Christian affiliation falls sharply in the United States", y:2024, r:"world", c:["rel","soc"],
 s:"The share of American adults identifying as Christian fell from roughly 78% in 2007 to around 62% by the mid-2020s, while those claiming no religion rose from about 16% to nearly 30%. The decline appears to have levelled off rather than continuing steadily downward.",
 u:"A trend rather than a snapshot, which makes it usable for arguing either that secularisation is inevitable or that it has limits."},

{t:"Myanmar's Rohingya are driven out amid Buddhist nationalism", y:2017, r:"asia", c:["rel","glo","eth"],
 s:"More than 700,000 Rohingya Muslims fled military operations in Rakhine State into Bangladesh, in violence later described by UN investigators as genocidal in intent. Buddhist nationalist movements had spent years campaigning against the minority's citizenship.",
 u:"A corrective to the assumption that religious violence follows a single template — here the majority faith is one usually associated with pacifism."},

/* ---------- EDUCATION ---------- */
{t:"China bans for-profit tutoring in core school subjects", y:2021, r:"asia", c:["edu","eco","pol"],
 s:"The double reduction policy outlawed for-profit tutoring in school subjects, restricted weekend and holiday classes, and wiped out an industry estimated in the tens of billions of dollars. Reports suggest tutoring continued underground at higher prices, favouring wealthier families.",
 u:"The strongest test case for whether governments can legislate away educational arms races — and evidence that demand relocates rather than disappears."},

{t:"South Korea caps late-night tutoring to curb an education arms race", y:2011, r:"asia", c:["edu","soc","eco"],
 s:"Curfews restricting hagwon operating hours past 10pm were enforced with inspectors and informant rewards, in a country where household spending on private education runs into tens of billions of dollars a year. Spending has continued rising regardless.",
 u:"Pairs with Singapore's tuition culture to argue that competitive schooling is driven by parental anxiety that regulation cannot reach."},

{t:"Sweden pulls back from screens and returns to printed textbooks", y:2023, r:"world", c:["edu","sci","soc"],
 s:"After years of heavy digitalisation, the government funded a return to physical books and reduced screen use in early years, citing reading comprehension declines and weak evidence for tablets. The reversal followed a fall in national reading scores.",
 u:"A rare documented policy reversal on classroom technology — valuable because it lets a student argue against the assumption that digital always means progress."},

{t:"Reading and maths scores fall across most countries after the pandemic", y:2023, r:"world", c:["edu","soc","hea"],
 s:"The 2022 PISA round recorded the steepest drop in maths performance in the survey's history across OECD countries, though a handful including Singapore, Japan and South Korea held up or improved. Time out of classrooms explained only part of the variation.",
 u:"Concrete evidence on what school closures cost, and on why some systems absorbed the shock better than others."},

{t:"Kenya abolishes primary school fees and enrolment surges", y:2003, r:"world", c:["edu","eco","soc"],
 s:"Removing fees brought well over a million additional children into primary school almost immediately, but class sizes ballooned and teacher numbers lagged, raising questions about quality. The policy has been widely copied across sub-Saharan Africa.",
 u:"Separates access from quality — a distinction most education essays collapse."},

/* ---------- GENDER & EQUALITY ---------- */
{t:"Iceland requires employers to prove they pay men and women equally", y:2018, r:"world", c:["gen","eco","pol"],
 s:"Companies above a certain size must obtain certification demonstrating equal pay for work of equal value, reversing the usual burden of proof from the employee onto the employer. Iceland has topped global gender gap rankings for well over a decade.",
 u:"Shifts a gender essay from whether inequality exists to who should have to prove it — a sharper argument than most students make."},

{t:"Rwanda has the world's highest share of women in parliament", y:2003, r:"world", c:["gen","pol","soc"],
 s:"Constitutional quotas introduced after the genocide reserved seats for women, and the share of women in the lower house has exceeded 60% since 2013 — higher than any other country. Critics note that political power remains concentrated and contested elsewhere in the system.",
 u:"Shows quotas producing rapid, durable descriptive representation, while raising the question of whether representation equals power."},

{t:"The Gambia comes close to repealing its ban on female genital cutting", y:2024, r:"world", c:["gen","rel","eth"],
 s:"Parliament debated overturning a 2015 ban after religious leaders argued it infringed cultural and religious practice; the repeal was ultimately rejected. It would have been the first national reversal of such a ban anywhere.",
 u:"Direct evidence that legal protections for women can be rolled back, and that the challenge often comes framed as cultural rights."},

{t:"Japan's top court moves against a rule forcing couples to share one surname", y:2024, r:"asia", c:["gen","soc","pol"],
 s:"Japan is the only country legally requiring married couples to adopt a single surname, and in practice the overwhelming majority of women change theirs. Business groups joined long-running legal challenges arguing the rule holds back women's careers.",
 u:"A small, concrete example of how law shapes gender roles through administrative detail rather than open discrimination."},

/* ---------- ENVIRONMENT & CLIMATE ---------- */
{t:"Ecuadorians vote to leave oil in the ground beneath a rainforest", y:2023, r:"world", c:["env","pol","eco"],
 s:"A national referendum backed halting oil extraction in a block of Yasuní National Park, one of the most biodiverse places on earth, forcing the state oil company to wind down operations. It was the first time a country had voted directly to forgo fossil fuel revenue.",
 u:"The clearest available example of democratic choice favouring conservation over income — and a test of whether such votes get implemented."},

{t:"Costa Rica doubles its forest cover after decades of clearing", y:2019, r:"world", c:["env","eco","pol"],
 s:"Forest cover fell to around a quarter of the country by the 1980s and has since recovered to over half, driven by payments to landowners for conserving watersheds and biodiversity, funded partly by a fuel tax. Nearly all its electricity now comes from renewables.",
 u:"Shows deforestation is reversible, and that paying people not to clear land can work at national scale."},

{t:"Countries agree a treaty to protect the high seas", y:2023, r:"world", c:["env","glo","eth"],
 s:"After nearly two decades of talks, UN members adopted an agreement allowing marine protected areas in international waters, which cover roughly two-thirds of the ocean and had almost no conservation framework. Ratification by enough states was required before it could take effect.",
 u:"A counterexample to climate pessimism about international cooperation, with the usual caveat that agreement and enforcement are different things."},

{t:"Dutch farmers block roads over nitrogen emission limits", y:2022, r:"world", c:["env","eco","pol"],
 s:"Court-mandated cuts to nitrogen pollution implied buying out or shrinking large numbers of livestock farms in one of the world's biggest agricultural exporters. Protests with tractors and manure blockades fed the rise of a farmers' party that won a provincial election.",
 u:"Shows environmental policy generating a political backlash strong enough to reshape a party system."},

{t:"Solar becomes the cheapest source of new electricity in most of the world", y:2024, r:"world", c:["env","eco","sci"],
 s:"Utility-scale solar costs fell by roughly 90% between 2010 and the mid-2020s, making it cheaper than new coal or gas across most markets, and renewables now supply around 30% of global electricity. Grid storage and transmission remain the binding constraints rather than generation cost.",
 u:"Reframes the climate argument from sacrifice to economics — the trend matters more than either individual figure."},

/* ---------- ARTS, CULTURE & SPORT ---------- */
{t:"German museums begin returning the Benin Bronzes to Nigeria", y:2022, r:"world", c:["art","eth","glo"],
 s:"Germany transferred ownership of more than a thousand artefacts looted by British forces in 1897, with some physically returned to Nigeria. Other institutions holding the bronzes, including the British Museum, have not followed.",
 u:"A restitution case that actually happened, which makes it more useful than the still-unresolved Parthenon dispute."},

{t:"Afrobeats and Nollywood turn Nigerian culture into a global export", y:2023, r:"world", c:["art","eco","glo"],
 s:"Nigerian artists filled major international venues and the country's film industry became one of the world's largest by output, supported by streaming platforms commissioning local content. Infrastructure and piracy remain constraints on domestic earnings.",
 u:"Shows cultural globalisation flowing outward from Africa rather than only inward — a corrective to essays that treat it as Western export."},

{t:"Venice charges day-trippers an entry fee", y:2024, r:"world", c:["art","env","eco"],
 s:"The city introduced a booking system and fee for day visitors on peak days, after its resident population fell below 50,000 while annual visitors ran into the tens of millions. Early results suggested modest effects on crowding.",
 u:"Makes the overtourism argument concrete: heritage cities can price access, but whether it changes behaviour is a separate question."},

{t:"Squid Game becomes a global hit in a language most viewers cannot speak", y:2021, r:"asia", c:["art","med","eco"],
 s:"The Korean series became Netflix's most-watched launch at the time, made for a fraction of comparable American budgets, and centred on debt and inequality in Korean society. Subtitled and dubbed viewing outside Korea drove almost all of the audience.",
 u:"Evidence that cultural products no longer need to be in English or set in the West to travel."},

/* ---------- SCIENCE, HEALTH & DEVELOPMENT — non-Western ---------- */
{t:"M-Pesa turns mobile phones into bank accounts across East Africa", y:2007, r:"world", c:["sci","eco","soc"],
 s:"A text-message money transfer service launched in Kenya now moves sums equivalent to a large share of national GDP, reaching people who never had bank accounts. Research has linked access to reduced poverty, particularly for female-headed households.",
 u:"The best example of technology leapfrogging — a poorer country solving a problem before richer ones, rather than copying them."},

{t:"Drones deliver blood to Rwandan hospitals faster than roads allow", y:2016, r:"world", c:["sci","hea","eco"],
 s:"A national drone network began delivering blood and medical supplies to remote clinics, cutting delivery times from hours to minutes and reducing wastage of perishable stock. The model has since been extended to other countries.",
 u:"Shows infrastructure gaps being answered with new technology rather than by first building the old kind."},

{t:"Malaria vaccines begin routine rollout in African countries", y:2024, r:"world", c:["hea","sci","glo"],
 s:"Cameroon became the first country to introduce malaria vaccination into its routine childhood programme, followed by others, after decades in which a vaccine for a parasite was thought unachievable. Malaria still kills over half a million people a year, mostly young children.",
 u:"A concrete answer to whether medical research reaches the diseases of the poor — and a reminder of how long it took."},

{t:"Countries adopt a pandemic agreement after years of negotiation", y:2025, r:"world", c:["hea","glo","pol"],
 s:"WHO member states adopted an accord on preparedness, covering pathogen sample sharing and commitments on distributing vaccines and treatments more equitably than during COVID. Key provisions depend on a separate annex and national ratification, and the United States did not take part.",
 u:"Tests whether the world learned from vaccine inequity, with the honest answer that agreement was reached but enforcement was not."},

{t:"Brazil pays poor families to keep children in school", y:2003, r:"world", c:["eco","edu","soc"],
 s:"Bolsa Família made cash transfers conditional on school attendance and health check-ups, reaching tens of millions and contributing to sharp falls in extreme poverty for a cost of roughly half a percent of GDP. The design has been copied in dozens of countries.",
 u:"Evidence that welfare can be cheap and effective, useful against arguments that redistribution necessarily wastes money."},

/* ---------- POLITICS, ECONOMY & JUSTICE — filling regional gaps ---------- */
{t:"Chile rejects two attempts to replace its constitution", y:2023, r:"world", c:["pol","soc","eth"],
 s:"Mass protests in 2019 produced a process to rewrite the dictatorship-era constitution, but voters rejected a progressive draft in 2022 and a conservative one in 2023, leaving the original text in place. Turnout was compulsory for both votes.",
 u:"Complicates the assumption that street protest translates into constitutional change, and shows referendums can produce deadlock."},

{t:"Colombia signs a peace deal that voters had rejected", y:2016, r:"world", c:["glo","pol","eth"],
 s:"An agreement ending more than fifty years of conflict with FARC guerrillas was narrowly voted down in a referendum, then revised and passed through Congress instead. Implementation has been uneven and killings of former combatants and activists have continued.",
 u:"Raises a hard question for democratic theory: whether peace should be subject to a popular vote at all."},

{t:"A former Philippine president is arrested for his drug war", y:2025, r:"asia", c:["eth","pol","glo"],
 s:"Rodrigo Duterte was taken into custody on an International Criminal Court warrant over killings during anti-drug operations that human rights groups estimate ran into the tens of thousands. The Philippines had withdrawn from the court in 2019.",
 u:"One of the few instances of international justice reaching a former head of government, useful for testing whether such courts have teeth."},

{t:"Nigeria removes its fuel subsidy and prices triple", y:2023, r:"world", c:["eco","pol","soc"],
 s:"Ending a subsidy that had cost billions annually caused petrol prices to rise sharply, along with transport and food costs, prompting strikes. Successive governments had avoided the change despite the fiscal burden.",
 u:"Shows why economically sensible reforms are politically avoided — the costs are immediate and visible, the benefits diffuse."},

{t:"Africa launches the world's largest free trade area by membership", y:2021, r:"world", c:["eco","glo","pol"],
 s:"The African Continental Free Trade Area began trading with over fifty member states, aiming to lift intra-African trade from roughly 15% of the continent's total. Progress has been slowed by infrastructure gaps, customs procedures and non-tariff barriers.",
 u:"A counterweight to essays that treat globalisation as finished or in retreat — regional integration is still being built."},

{t:"Venezuela's collapse produces the largest displacement in the Americas", y:2023, r:"world", c:["glo","eco","soc"],
 s:"Economic collapse and political crisis drove more than seven million people out of the country, most into neighbouring Colombia, Peru and Ecuador. Regional hosts absorbed the flow with far less international funding per person than crises elsewhere have received.",
 u:"Useful for migration essays needing a non-European example, and for arguing that attention and money follow geography rather than need."},

{t:"Ethiopia's dam on the Nile becomes a regional flashpoint", y:2022, r:"world", c:["env","glo","eco"],
 s:"The Grand Ethiopian Renaissance Dam is Africa's largest hydroelectric project and will supply power to a country where a large share of people lacked electricity. Egypt, dependent on the Nile for nearly all its fresh water, has treated the filling schedule as an existential issue.",
 u:"The best available example of water as a source of interstate conflict, and of development in one country imposing risk on another."},

{t:"Indonesia moves its capital off its most crowded island", y:2024, r:"asia", c:["env","pol","eco"],
 s:"Construction of Nusantara in Borneo began as Jakarta continued sinking, with parts of the city dropping by centimetres a year due to groundwater extraction and rising seas. Funding has fallen short of projections and the transfer has been repeatedly delayed.",
 u:"An extreme case of climate adaptation — relocating a capital rather than defending it — with the practical difficulties on display."}
];

const path = "data/entries.json";
const existing = JSON.parse(await fs.readFile(path, "utf8"));

const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const ids = new Set(existing.map(e => e.id));
const titles = new Set(existing.map(e => e.t.toLowerCase()));

// Backdate so none of these land in the homepage's fresh window.
const base = new Date("2026-09-02T00:00:00Z").getTime();

const prepared = [];
NEW.forEach((e, i) => {
  if(titles.has(e.t.toLowerCase())){ console.log("skip duplicate:", e.t); return; }
  let id = slug(e.t), n = 2;
  while(ids.has(id)) id = `${slug(e.t)}-${n++}`;
  ids.add(id);
  prepared.push({ ...e, id, link: null, source: null,
                  added: new Date(base + i * 60000).toISOString() });
});

await fs.writeFile(path, JSON.stringify([...existing, ...prepared], null, 1) + "\n");
console.log(`Added ${prepared.length}. Bank now holds ${existing.length + prepared.length}.`);
