// Reviewed identity associations, never fuzzy matches or caller-supplied URLs.
// A corporate email domain need not have an indexed public website or redirect.
const ASSOCIATIONS=Object.freeze({
  'fmr.com':Object.freeze({research_domain:'fidelity.com',organization:'Fidelity Investments / FMR LLC',basis:'first_party_corporate_email_domain_association',checked_at:'2026-11-16',
    sources:[{url:'https://www.fidelity.com/supplier/contact-us',title:'Fidelity supplier customer service contacts',claim:'Fidelity publishes its supplier contact using the fmr.com email domain.'},
      {url:'https://prime.fidelity.com/about-us',title:'About Fidelity Prime Services',claim:'The official page identifies Fidelity Investments and publishes an fmr.com contact address.'}],
    limitation:'This links a corporate email domain to the public Fidelity website. It is not an HTTP redirect or proof that every Fidelity capability applies to every FMR subsidiary.'}),
});
export function resolveResearchDomain(domain){
  const association=Object.hasOwn(ASSOCIATIONS,domain)?ASSOCIATIONS[domain]:null;
  return association?{requested_domain:domain,...structuredClone(association)}:{requested_domain:domain,research_domain:domain,basis:'exact_domain'};
}
export function belongsToDomain(url,domain){try{const p=new URL(url);return p.protocol==='https:'&&!p.username&&!p.password&&!p.port&&typeof domain==='string'&&(p.hostname===domain||p.hostname.endsWith(`.${domain}`));}catch{return false;}}
export function belongsToResearchCompany(url,domain){const resolved=resolveResearchDomain(domain);return belongsToDomain(url,domain)||belongsToDomain(url,resolved.research_domain);}
export function excludedCompanyContent(url){
  // Fidelity's hosted market-news article feed is not its own operational
  // announcement surface. Newsroom/official business-update pages stay eligible.
  try{const p=new URL(url);return belongsToDomain(url,'fidelity.com')&&p.pathname.startsWith('/news/article/');}catch{return false;}
}
