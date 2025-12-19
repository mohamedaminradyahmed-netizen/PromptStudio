import { supabase } from '../lib/supabase';
import type { Template, Technique } from '../types';

export async function getTemplates(): Promise<Template[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('usage_count', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getTemplateById(id: string): Promise<Template | null> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getTemplatesByCategory(category: string): Promise<Template[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('category', category)
    .order('usage_count', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getFeaturedTemplates(): Promise<Template[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('is_featured', true)
    .order('usage_count', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function searchTemplates(query: string): Promise<Template[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .order('usage_count', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function incrementTemplateUsage(id: string): Promise<void> {
  const { data: template } = await supabase
    .from('templates')
    .select('usage_count')
    .eq('id', id)
    .single();

  if (template) {
    await supabase
      .from('templates')
      .update({ usage_count: (template.usage_count || 0) + 1 })
      .eq('id', id);
  }
}

export async function getTechniques(): Promise<Technique[]> {
  const { data, error } = await supabase
    .from('techniques')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getTechniqueBySlug(slug: string): Promise<Technique | null> {
  const { data, error } = await supabase
    .from('techniques')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getTechniquesByCategory(category: string): Promise<Technique[]> {
  const { data, error } = await supabase
    .from('techniques')
    .select('*')
    .eq('category', category)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function searchTechniques(query: string): Promise<Technique[]> {
  const { data, error } = await supabase
    .from('techniques')
    .select('*')
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}
