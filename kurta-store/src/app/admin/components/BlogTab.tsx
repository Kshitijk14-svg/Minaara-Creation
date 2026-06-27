'use client';

import React, { useEffect, useState, useCallback } from 'react';
import AdminModal from './shared/AdminModal';
import FormField, { inputStyle } from './shared/FormField';
import StatusBadge from './shared/StatusBadge';
import AdminTable from './shared/AdminTable';
import LoadingSkeleton from './shared/LoadingSkeleton';
import ConfirmInline from './shared/ConfirmInline';
import ImageUploader from './shared/ImageUploader';

interface Post {
  id: string; title: string; slug: string; content: string;
  excerpt: string | null; coverImageUrl: string | null;
  isPublished: boolean; publishedAt: string | null;
  createdAt: string; updatedAt: string;
}

const EMPTY_FORM = {
  title: '', slug: '', content: '', excerpt: '', coverImageUrl: '', isPublished: false,
};

export default function BlogTab() {
  const [posts, setPosts]             = useState<Post[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modalOpen, setModalOpen]     = useState(false);
  const [editing, setEditing]         = useState<Post | null>(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/blog');
      const data = await res.json();
      if (res.ok) setPosts(data.posts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setError(''); setModalOpen(true); };
  const openEdit   = (p: Post) => {
    setEditing(p);
    setForm({ title: p.title, slug: p.slug, content: p.content, excerpt: p.excerpt ?? '', coverImageUrl: p.coverImageUrl ?? '', isPublished: p.isPublished });
    setError('');
    setModalOpen(true);
  };

  const toSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) { setError('Title and content are required.'); return; }
    setSaving(true); setError('');
    try {
      const url    = editing ? `/api/blog/${editing.slug}` : '/api/blog';
      const method = editing ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:         form.title,
          slug:          form.slug || toSlug(form.title),
          content:       form.content,
          excerpt:       form.excerpt || undefined,
          coverImageUrl: form.coverImageUrl || undefined,
          isPublished:   form.isPublished,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to save post'); return; }
      setModalOpen(false);
      fetchPosts();
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (p: Post) => {
    await fetch(`/api/blog/${p.slug}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPublished: !p.isPublished }) });
    fetchPosts();
  };

  const handleDelete = async (slug: string) => {
    await fetch(`/api/blog/${slug}`, { method: 'DELETE' });
    setConfirmSlug(null);
    fetchPosts();
  };

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <div style={{ padding: '32px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-brand-charcoal)', margin: 0 }}>
          Journal Posts
        </h2>
        <button onClick={openCreate} style={{ padding: '10px 24px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
          + New Post
        </button>
      </div>

      {loading ? <LoadingSkeleton rows={5} /> : (
        <AdminTable
          headers={['Title', 'Status', 'Published', '']}
          isEmpty={posts.length === 0}
          empty={<p style={{ padding: '40px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-brand-charcoal)', opacity: 0.4 }}>No posts yet. Write your first story.</p>}
        >
          {posts.map((p) => (
            <tr key={p.id} style={{ borderBottom: '1px solid var(--color-brand-mist)' }}>
              <td style={{ padding: '14px 16px' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--color-brand-charcoal)', margin: 0 }}>{p.title}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-brand-charcoal)', opacity: 0.4, margin: '2px 0 0' }}>/blog/{p.slug}</p>
              </td>
              <td style={{ padding: '14px 16px' }}>
                <StatusBadge status={p.isPublished ? 'ACTIVE' : 'INACTIVE'} />
              </td>
              <td style={{ padding: '14px 16px', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)', opacity: 0.6 }}>
                {fmtDate(p.publishedAt)}
              </td>
              <td style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => togglePublish(p)} style={{ padding: '5px 12px', borderRadius: '4px', border: '1px solid var(--color-brand-mist)', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: p.isPublished ? '#C0392B' : 'var(--color-brand-mauve)' }}>
                    {p.isPublished ? 'Unpublish' : 'Publish'}
                  </button>
                  <button onClick={() => openEdit(p)} style={{ padding: '5px 12px', borderRadius: '4px', border: '1px solid var(--color-brand-mist)', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: 'var(--color-brand-charcoal)' }}>
                    Edit
                  </button>
                  {confirmSlug === p.slug ? (
                    <ConfirmInline onConfirm={() => handleDelete(p.slug)} onCancel={() => setConfirmSlug(null)} label="Delete?" />
                  ) : (
                    <button onClick={() => setConfirmSlug(p.slug)} style={{ padding: '5px 12px', borderRadius: '4px', border: '1px solid #FCA5A5', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: '#C0392B' }}>
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}

      {/* Create / Edit Modal */}
      <AdminModal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Post' : 'New Post'} width="680px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <FormField label="Title" required error={!form.title && error ? 'Required' : undefined}>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="The Story of Indigo Block Print" style={inputStyle} />
          </FormField>

          <FormField label="Slug" hint="Auto-generated from title if left blank">
            <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder={toSlug(form.title || 'post-title')} style={inputStyle} />
          </FormField>

          <FormField label="Cover Image">
            <ImageUploader
              images={form.coverImageUrl ? [form.coverImageUrl] : []}
              onChange={(urls) => setForm((f) => ({ ...f, coverImageUrl: urls[0] ?? '' }))}
              maxImages={1}
            />
          </FormField>

          <FormField label="Excerpt" hint="Shown in the blog listing (max 500 chars)">
            <textarea value={form.excerpt} onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
              placeholder="A short description of this story…" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </FormField>

          <FormField label="Content" required error={!form.content && error ? 'Required' : undefined}>
            <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Write your story here. HTML tags are supported." rows={12}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '13px' }} />
          </FormField>

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--color-brand-charcoal)' }}>
              {form.isPublished ? 'Publish immediately (visible on /blog)' : 'Save as draft (hidden from public)'}
            </span>
          </label>

          {error && <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#C0392B' }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '8px' }}>
            <button onClick={() => setModalOpen(false)} style={{ padding: '10px 20px', border: '1px solid var(--color-brand-mist)', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--color-brand-charcoal)' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', backgroundColor: 'var(--color-brand-charcoal)', color: '#fff', border: 'none', borderRadius: '4px', cursor: saving ? 'wait' : 'pointer', fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Post'}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
