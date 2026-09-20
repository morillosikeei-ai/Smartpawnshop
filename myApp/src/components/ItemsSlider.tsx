import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import './ItemsSlider.css';

export interface AcceptedCategory {
    /** Image path. Put files in `public/items/` and reference them as `/items/<file>`. */
    image: string;
    name: string;
    /** Short list of accepted items shown under the category name. */
    items: string[];
}

/* ============================================================================
 * EDIT ONLY THIS ARRAY.
 *
 * How to swap an image:
 *   1. Drop the picture into  myApp/public/items/
 *   2. Point `image` at it, e.g. '/items/gadgets.png'
 *
 * Nothing below this array needs to change when you edit an image, a name, or
 * an item list. Until a real file exists at the path, a gold placeholder tile
 * is shown instead of a broken image.
 * ========================================================================== */
export const ACCEPTED_CATEGORIES: AcceptedCategory[] = [
    {
        image: '/items/gadgets.png',
        name: 'Gadgets',
        items: [
            'Cellphones',
            'Tablets',
            'Digital Cameras',
            'Laptops',
            'Desktop Computers',
            'Notebooks / Netbooks',
            'Game Consoles',
        ],
    },
    {
        image: '/items/appliances.png',
        name: 'Appliances',
        items: [
            'TV',
            'Refrigerator',
            'Aircon',
            'Home Theater',
            'Karaoke Machine',
            'Electric Fan',
            'Washing Machine',
            'Gas Stove / Range',
            'Sewing Machine',
            'Oven / Toaster',
            'Mixer / Blender',
            'Water Dispenser / Purifier',
            'Nebulizer',
        ],
    },
    {
        image: '/items/other-items.png',
        name: 'Other Items',
        items: ['Power Tools', 'Watches', 'Jewelry'],
    },
];

/** Milliseconds each slide stays on screen before auto-advancing. */
const AUTO_SLIDE_INTERVAL = 5000;

interface ItemsSliderProps {
    categories?: AcceptedCategory[];
}

const ItemsSlider: React.FC<ItemsSliderProps> = ({ categories = ACCEPTED_CATEGORIES }) => {
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
    const total = categories.length;
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const goTo = useCallback((next: number) => {
        if (total === 0) return;
        setIndex(((next % total) + total) % total);
    }, [total]);

    const next = useCallback(() => goTo(index + 1), [goTo, index]);
    const prev = useCallback(() => goTo(index - 1), [goTo, index]);

    useEffect(() => {
        if (paused || total < 2) return;
        timerRef.current = setInterval(() => setIndex((i) => (i + 1) % total), AUTO_SLIDE_INTERVAL);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
        };
    }, [paused, total]);

    if (total === 0) return null;

    return (
        <div
            className="items-slider"
            aria-roledescription="carousel"
            aria-label="Items we accept"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
        >
            <div className="items-slider-eyebrow">ITEMS WE ACCEPT</div>

            <div className="items-slider-viewport">
                <div className="items-slider-track" style={{ transform: `translateX(-${index * 100}%)` }}>
                    {categories.map((category, i) => (
                        <article
                            className="items-slide"
                            key={category.name}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`${i + 1} of ${total}: ${category.name}`}
                            aria-hidden={i !== index}
                        >
                            <div className="items-slide-media">
                                {failedImages[category.image] ? (
                                    <div className="items-slide-placeholder" aria-hidden="true">
                                        <span>{category.name.charAt(0)}</span>
                                    </div>
                                ) : (
                                    <img
                                        src={category.image}
                                        alt={category.name}
                                        loading={i === 0 ? 'eager' : 'lazy'}
                                        onError={() => setFailedImages((f) => ({ ...f, [category.image]: true }))}
                                    />
                                )}
                                <div className="items-slide-badge">{`0${i + 1}`}</div>
                            </div>

                            <div className="items-slide-caption">
                                <h3>{category.name}</h3>
                                <ul className="items-slide-list">
                                    {category.items.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        </article>
                    ))}
                </div>

                <button type="button" className="items-slider-arrow prev" onClick={prev} aria-label="Previous category">
                    <IonIcon icon={chevronBackOutline} />
                </button>
                <button type="button" className="items-slider-arrow next" onClick={next} aria-label="Next category">
                    <IonIcon icon={chevronForwardOutline} />
                </button>
            </div>

            <div className="items-slider-dots" role="tablist" aria-label="Choose category">
                {categories.map((category, i) => (
                    <button
                        type="button"
                        key={`dot-${category.name}`}
                        className={`items-slider-dot${i === index ? ' active' : ''}`}
                        onClick={() => goTo(i)}
                        role="tab"
                        aria-selected={i === index}
                        aria-label={category.name}
                    />
                ))}
            </div>
        </div>
    );
};

export default ItemsSlider;
