import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  StatusBadge,
  Thumb,
  KeyValueRow,
  ChecklistItem,
  Button,
  Disclaimer,
  RegNumber,
  BottomSheet
} from '../components';
import { Product, ChecklistItemModel } from '../types';
import { formatDisplayDate } from '../data/mappers';
import { repository } from '../data/repository';

interface ResultScreenProps {
  product: Product;
  onBack: () => void;
  onShowToast: (msg: string) => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  product: initialProduct,
  onBack,
  onShowToast,
}) => {
  const [product, setProduct] = useState<Product>(initialProduct);
  const [isSaved, setIsSaved] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItemModel[]>([]);
  const [syncDate, setSyncDate] = useState<string>('');

  // Always scroll to top on mount or when product changes, before browser paints
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [product.id, product.nafdac_reg_num]);

  useEffect(() => {
    // 1. Load catalog metadata
    repository.getCatalogMeta().then((meta) => {
      setSyncDate(meta.lastSynced);
    });

    // 2. Fetch full product details (to get active alerts and server-side checklist if available)
    repository.getProduct(initialProduct.id).then((fullProd) => {
      if (fullProd) {
        setProduct(fullProd);
      }
    });

    // 3. Load dynamic checklist and restore saved progress
    const loadChecklist = async () => {
      const points = await repository.resolveChecklist(
        initialProduct.category,
        initialProduct.pack_type,
        initialProduct.nafdac_reg_num,
        initialProduct.product_name
      );
      const savedProgress = await repository.getChecklistProgress(initialProduct.id);

      const resolved = points.map((p) => ({
        ...p,
        state: savedProgress[p.key] || 'todo',
      }));
      setChecklist(resolved);
    };

    loadChecklist();
  }, [initialProduct.id, initialProduct.category, initialProduct.pack_type, initialProduct.nafdac_reg_num, initialProduct.product_name]);

  const handleToggleChecklist = async (key: string) => {
    const item = checklist.find((c) => c.key === key);
    if (!item) return;

    const nextState: 'todo' | 'done' | 'flag' =
      item.state === 'todo' ? 'done' : item.state === 'done' ? 'flag' : 'todo';

    setChecklist((prev) =>
      prev.map((c) => (c.key === key ? { ...c, state: nextState } : c))
    );

    await repository.setChecklistProgress(product.id, key, nextState);
  };

  const handleSaveCheck = async () => {
    if (isSaved) {
      onShowToast('Already saved to this phone');
      return;
    }
    await repository.saveCheck(product);
    setIsSaved(true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:saved-checks-updated'));
    }
    onShowToast('Saved to this phone');
  };

  const getProductShareUrl = () => {
    return `${window.location.origin}/result/${encodeURIComponent(product.id)}`;
  };

  const handleOpenWhatsApp = () => {
    const resultUrl = getProductShareUrl();
    const statusText =
      product.status === 'match'
        ? '✅ Official NAFDAC Registry Match'
        : product.status === 'alert'
        ? '⚠️ Subject of Official NAFDAC Public Alert'
        : '❌ Registration Lapsed / Not Found in Registry';

    const messageLines = [
      `*CheckAm Product Verification*`,
      ``,
      `*Product:* ${product.product_name}`,
      `*NAFDAC no:* ${product.nafdac_reg_num}`,
      `*Maker:* ${product.manufacturer}`,
      `*Status:* ${statusText}`,
      ...(product.external_image_url ? [``, `*Pack photo:* ${product.external_image_url}`] : []),
      ``,
      `🔗 *View on CheckAm:* ${resultUrl}`,
      ``,
      `_Inspect the pack yourself. CheckAm shows what the NAFDAC registry says. It does not decide whether a product is genuine._`,
    ];

    const text = encodeURIComponent(messageLines.join('\n'));
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    setShareSheetOpen(false);
  };

  const handleCopyShareText = () => {
    const resultUrl = getProductShareUrl();
    const statusText =
      product.status === 'match'
        ? 'Official NAFDAC Registry Match'
        : product.status === 'alert'
        ? 'Subject of Official NAFDAC Public Alert'
        : 'Registration Lapsed / Not Found in Registry';

    const text = `CheckAm Product Verification:
Product: ${product.product_name}
NAFDAC no: ${product.nafdac_reg_num}
Maker: ${product.manufacturer}
Status: ${statusText}
${product.external_image_url ? `Pack photo: ${product.external_image_url}\n` : ''}
View on CheckAm: ${resultUrl}

Inspect the pack yourself. CheckAm shows what the NAFDAC registry says. It does not decide whether a product is genuine.`;

    navigator.clipboard.writeText(text);
    onShowToast('Verification summary & link copied to clipboard');
    setShareSheetOpen(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-ground pb-8 pt-2">
      {/* Top Header Bar */}
      <div className="bar flex items-center justify-between px-4 py-2">
        <button
          type="button"
          className="rb w-11 h-11 flex items-center justify-center border-thin border-ink rounded-full bg-surface hover:bg-surface-alt transition-colors"
          onClick={onBack}
          aria-label="Back to previous screen"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <b className="font-display font-black text-[19px]">Your result</b>
        <button
          type="button"
          className="rb w-11 h-11 flex items-center justify-center border-thin border-ink rounded-full bg-surface hover:bg-surface-alt transition-colors"
          onClick={() => setShareSheetOpen(true)}
          aria-label="Share verification result"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="12" r="2.6" />
            <circle cx="17.5" cy="6" r="2.6" />
            <circle cx="17.5" cy="18" r="2.6" />
            <path d="M8.3 10.8l7-3.5M8.3 13.2l7 3.5" />
          </svg>
        </button>
      </div>

      <main className="flex-1 px-4 flex flex-col gap-3">
        {/* Big Verdict Header Card */}
        {product.status === 'match' && (
          <div className="bg-ok-bg border-w border-ok rounded-lg p-5 flex flex-col gap-3 relative text-ok overflow-hidden shadow-card">
            <span
              className="absolute right-4 bottom-4 w-[68px] h-[68px] rounded-full bg-ok flex items-center justify-center"
              style={{ transform: 'rotate(8deg)' }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="var(--color-surface)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5.5 12.5l4.5 4.5 8.5-10" />
              </svg>
            </span>
            <StatusBadge status="match" size="full" />
            <h1 className="font-display font-black text-hero leading-tight text-ink max-w-[290px]">
              Found in the registry
            </h1>
            <p className="text-[15px] text-ink font-medium max-w-[240px]">
              {product.nafdac_reg_num} matches an active NAFDAC record{syncDate ? ` synced ${syncDate}` : ''}.
            </p>
          </div>
        )}

        {product.status === 'alert' && (
          <div className="bg-alert-bg border-w border-alert rounded-lg p-5 flex flex-col gap-3 relative text-alert overflow-hidden shadow-card">
            <span
              className="absolute right-4 bottom-4 w-[68px] h-[68px] rounded-full bg-alert flex items-center justify-center"
              style={{ transform: 'rotate(8deg)' }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="var(--color-surface)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3.5l9.5 16.5h-19z" />
                <path d="M12 10v4.5M12 17.2v.1" />
              </svg>
            </span>
            <StatusBadge status="alert" size="full" />
            <h1 className="font-display font-black text-hero leading-tight text-ink max-w-[290px]">
              Named in a public alert
            </h1>
            <p className="text-[15px] text-ink font-medium max-w-[240px]">
              {product.nafdac_reg_num} is flagged in an active public recall alert.
            </p>
          </div>
        )}

        {product.status === 'lapsed' && (
          <div className="bg-warn-bg border-w border-warn rounded-lg p-5 flex flex-col gap-3 relative text-warn overflow-hidden shadow-card">
            <span
              className="absolute right-4 bottom-4 w-[68px] h-[68px] rounded-full bg-warn flex items-center justify-center"
              style={{ transform: 'rotate(8deg)' }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="var(--color-surface)" strokeWidth="3.4" strokeLinecap="round">
                <path d="M6 12h12" />
              </svg>
            </span>
            <StatusBadge status="lapsed" size="full" />
            <h1 className="font-display font-black text-hero leading-tight text-ink max-w-[250px]">
              Not found in the registry
            </h1>
            <p className="text-[15px] text-ink font-medium max-w-[240px]">
              {product.nafdac_reg_num} is lapsed or missing in NAFDAC records{syncDate ? ` synced ${syncDate}` : ''}.
            </p>
          </div>
        )}

        {/* Public Alert Details (if alert status) */}
        {product.status === 'alert' && (
          <div className="ca-alert" role="alert">
            <span className="ca-alert-i" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3.5l9.5 16.5h-19z" />
                <path d="M12 10v4.5M12 17.2v.1" />
              </svg>
            </span>
            <div className="ca-alert-b">
              <div className="ca-alert-k">OFFICIAL NOTICE</div>
              <div className="ca-alert-h">{product.alert_title || product.product_name}</div>
              <div className="ca-alert-m">{product.alert_meta || 'nafdac.gov.ng'}</div>
            </div>
          </div>
        )}

        {/* Product Strip Card */}
        <div className="flex gap-3 items-center bg-surface border-w border-line rounded-lg p-3 shadow-sm">
          <button
            type="button"
            className="relative flex-none"
            role="button"
            aria-label="View larger image"
            onClick={() => setImagePreviewOpen(true)}
          >
            <Thumb kind={product.kind || 'tin'} imageUrl={product.external_image_url || undefined} size="72" />
            <span className="absolute -right-1.5 -bottom-1.5 w-7 h-7 rounded-full bg-accent text-on-accent border-2 border-surface flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 20h4v-4" />
                <path d="M14 14l6 6" />
                <path d="M8 4H4v4" />
                <path d="M4 4l6 6" />
              </svg>
            </span>
          </button>
          <div className="flex-1 min-w-0">
            <b className="font-display font-black text-base leading-snug block truncate text-ink">
              {product.product_name}
            </b>
            <span className="text-[13px] text-ink-muted block truncate">{product.manufacturer}</span>
          </div>
        </div>

        {/* Registry Details Panel (shown only when record exists in registry) */}
        {product.status !== 'lapsed' && (
          <div className="bg-surface rounded-lg border-w border-line px-5 py-2">
            <KeyValueRow label="NAFDAC no." value={product.nafdac_reg_num} />
            <KeyValueRow label="Registered to" value={product.manufacturer} />
            {product.registered_on && (
              <KeyValueRow label="Registered on" value={formatDisplayDate(product.registered_on)} />
            )}
            <KeyValueRow
              label="Valid until"
              value={product.expires_on ? formatDisplayDate(product.expires_on) : 'Not listed'}
            />
            {product.pack_type && (
              <KeyValueRow label="Packaging" value={product.pack_type} />
            )}
            <KeyValueRow label="Source" value={product.source_portal || 'NAFDAC public registry'} />
          </div>
        )}

        {/* Interactive Packaging Authenticity Checklist Panel */}
        <div className="bg-surface rounded-lg border-w border-line px-5 py-3">
          <h3 className="font-display font-black text-[17px] pt-1 pb-1">Check the pack yourself</h3>
          {checklist.map((item) => (
            <ChecklistItem
              key={item.key}
              title={item.label}
              detail={item.detail}
              state={item.state}
              flagHint="Take a photo. If this looks altered or unexpected, do not consume and report to NAFDAC."
              onToggle={() => handleToggleChecklist(item.key)}
            />
          ))}
        </div>

        {/* Actions & Legal Disclaimer */}
        <div className="flex flex-col gap-2 pt-2">
          <Button
            tone="primary"
            width="full"
            label="Share on WhatsApp"
            onClick={() => setShareSheetOpen(true)}
          />
          <Button
            tone="ghost"
            width="auto"
            label={isSaved ? '✓ Saved to this phone' : 'Save this check'}
            onClick={handleSaveCheck}
          />
          <Disclaimer />
        </div>
      </main>

      {/* Image Sheet Viewer */}
      <BottomSheet isOpen={imagePreviewOpen} onClose={() => setImagePreviewOpen(false)} title="Image preview">
        <div className="w-full aspect-[4/3] bg-surface-alt border-thin border-line rounded-lg flex items-center justify-center overflow-hidden">
          {product.external_image_url ? (
            <img src={product.external_image_url} alt={product.product_name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-[84%] flex items-center justify-center">
              <Thumb kind={product.kind || 'tin'} size="lg" className="w-28 h-28" />
            </div>
          )}
        </div>
        <h2 className="font-display font-black text-xl text-ink leading-tight mt-1">
          {product.product_name}
        </h2>
        <div className="flex items-center gap-2 text-[13px] text-ink-muted">
          <RegNumber value={product.nafdac_reg_num} />
          <span>·</span>
          <span>{product.manufacturer}</span>
        </div>
      </BottomSheet>

      {/* Share on WhatsApp Sheet */}
      <BottomSheet isOpen={shareSheetOpen} onClose={() => setShareSheetOpen(false)} title="Share on WhatsApp">
        <h2 className="font-display font-black text-[22px] text-ink leading-tight">
          Share on WhatsApp
        </h2>
        <div className="w-full aspect-[4/3] bg-surface-alt border-thin border-line rounded-lg flex items-center justify-center overflow-hidden">
          {product.external_image_url ? (
            <img src={product.external_image_url} alt={product.product_name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-[84%] flex items-center justify-center">
              <Thumb kind={product.kind || 'tin'} size="lg" className="w-28 h-28" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <b className="font-display font-black text-[18px] text-ink">{product.product_name}</b>
          <div className="flex items-center gap-2">
            <RegNumber value={product.nafdac_reg_num} />
            <StatusBadge status={product.status} size="short" />
          </div>
        </div>

        {/* Direct Link Preview Box */}
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-alt/60 border border-line rounded-md text-xs">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-accent">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span className="truncate flex-1 font-mono text-[11px] text-ink-muted">{getProductShareUrl()}</span>
        </div>

        <p className="text-xs text-ink-muted leading-relaxed">
          Inspect the pack yourself. CheckAm shows what the NAFDAC registry says. It does not decide whether a product is genuine.
        </p>
        <Button tone="primary" width="full" label="Open WhatsApp" onClick={handleOpenWhatsApp} />
        <div className="grid grid-cols-2 gap-2 mt-1">
          <Button tone="secondary" width="full" label="Copy text" onClick={handleCopyShareText} />
          <Button tone="ghost" width="full" label="Cancel" onClick={() => setShareSheetOpen(false)} />
        </div>
      </BottomSheet>
    </div>
  );
};
