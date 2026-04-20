import type { CoaTemplate } from '../coa.types';
import { agricultureTemplate } from './agriculture.template';
import { retailTemplate } from './retail.template';
import { servicesTemplate } from './services.template';
import { technologyTemplate } from './technology.template';

const TEMPLATES: Record<string, CoaTemplate> = {
  agriculture: agricultureTemplate,
  retail: retailTemplate,
  services: servicesTemplate,
  technology: technologyTemplate,
  manufacturing: stubTemplate('manufacturing', 'Manufacturing'),
  healthcare: stubTemplate('healthcare', 'Healthcare'),
  'real-estate': stubTemplate('real-estate', 'Real Estate'),
  hospitality: stubTemplate('hospitality', 'Hospitality'),
  'non-profit': stubTemplate('non-profit', 'Non-Profit'),
  'financial-services': stubTemplate('financial-services', 'Financial Services'),
};

function stubTemplate(industry: string, label: string): CoaTemplate {
  return {
    name: `${label} Chart of Accounts`,
    description: `Standard ${label} chart of accounts (stub — full template coming soon)`,
    industry,
    accounts: [],
  };
}

export function getTemplate(name: string): CoaTemplate {
  const template = TEMPLATES[name];
  if (!template) throw new Error(`Unknown template: ${name}`);
  if (template.accounts.length === 0) {
    throw new Error(`Template '${name}' is not yet implemented`);
  }
  return template;
}
