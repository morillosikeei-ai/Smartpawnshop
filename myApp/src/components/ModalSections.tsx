import React, { useEffect, useId, useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import './ModalSections.css';

export type ModalSection = {
    id: string;
    label: string;
    icon: string;
    /** A small number beside the label, such as how many renewals there are. */
    count?: number;
    content: React.ReactNode;
};

type Props = {
    sections: ModalSection[];
    /** Read by screen readers as the name of the section list. */
    label: string;
    /** When this changes (a different record opens), the first section shows again. */
    resetKey?: string | number | null;
};

/**
 * A long modal split into sections with a side menu, so one section shows at a
 * time instead of the whole record stacked in one long scroll.
 *
 * Wide screens get a menu down the left; phones get a row of tabs across the
 * top that scrolls sideways. It is a standard tab list for assistive tech:
 * arrow keys move between sections, Home and End jump to the ends.
 */
const ModalSections: React.FC<Props> = ({ sections, label, resetKey }) => {
    const [active, setActive] = useState(sections[0]?.id);
    const baseId = useId();
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setActive(sections[0]?.id); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // A section that went away (say, a record with fewer parts) falls back to the first.
    const current = sections.find(section => section.id === active) || sections[0];

    const select = (id: string, focus = false) => {
        setActive(id);
        panelRef.current?.scrollTo({ top: 0 });
        if (focus) tabRefs.current[id]?.focus();
        tabRefs.current[id]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    const onKeyDown = (event: React.KeyboardEvent, index: number) => {
        const last = sections.length - 1;
        const next = {
            ArrowDown: index === last ? 0 : index + 1,
            ArrowRight: index === last ? 0 : index + 1,
            ArrowUp: index === 0 ? last : index - 1,
            ArrowLeft: index === 0 ? last : index - 1,
            Home: 0,
            End: last,
        }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        select(sections[next].id, true);
    };

    if (!current) return null;

    return (
        <div className="modal-sections">
            <nav className="ms-nav" role="tablist" aria-label={label} aria-orientation="vertical">
                {sections.map((section, index) => {
                    const selected = section.id === current.id;
                    return (
                        <button
                            key={section.id}
                            ref={element => { tabRefs.current[section.id] = element; }}
                            type="button"
                            role="tab"
                            id={`${baseId}-tab-${section.id}`}
                            aria-selected={selected}
                            aria-controls={`${baseId}-panel`}
                            tabIndex={selected ? 0 : -1}
                            className={`ms-tab${selected ? ' is-active' : ''}`}
                            onClick={() => select(section.id)}
                            onKeyDown={event => onKeyDown(event, index)}
                        >
                            <IonIcon icon={section.icon} aria-hidden="true" />
                            <span>{section.label}</span>
                            {section.count !== undefined && <em className="ms-count">{section.count}</em>}
                        </button>
                    );
                })}
            </nav>
            <div
                ref={panelRef}
                className="ms-panel"
                role="tabpanel"
                id={`${baseId}-panel`}
                aria-labelledby={`${baseId}-tab-${current.id}`}
                tabIndex={0}
            >
                {current.content}
            </div>
        </div>
    );
};

export default ModalSections;
