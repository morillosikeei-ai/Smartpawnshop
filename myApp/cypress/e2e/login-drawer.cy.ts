/**
 * The Login panel is a drawer against the right edge of the viewport.
 * These checks fail if any part of it, or of the page behind it, reaches
 * past that edge at desktop, tablet or phone width.
 */
const sizes: [string, number, number][] = [
    ['desktop', 1440, 900],
    ['laptop', 1280, 800],
    ['tablet', 820, 1180],
    ['small tablet', 600, 960],
    ['phone', 390, 844],
];

const openLogin = (width: number) => {
    if (width <= 620) {
        cy.get('.menu-toggle', { timeout: 15000 }).click();
        cy.get('.dropdown-actions ion-button').click();
    } else {
        cy.get('.nav-actions .nav-btn', { timeout: 15000 }).first().click();
    }
};

describe('Login drawer stays inside the viewport', () => {
    sizes.forEach(([label, width, height]) => {
        it(`fits at ${label} ${width}x${height}`, () => {
            cy.viewport(width, height);
            cy.visit('/');
            openLogin(width);
            cy.get('ion-modal.auth-modal').should('be.visible');
            cy.contains('.modal-title', 'Login Page').should('be.visible');
            cy.wait(600); // let the drawer finish sliding in

            cy.window().then(win => {
                const doc = win.document;
                const viewportWidth = doc.documentElement.clientWidth;

                // No horizontal scrolling on the page itself.
                expect(doc.documentElement.scrollWidth, 'document scrollWidth')
                    .to.be.at.most(viewportWidth);

                const modal = Array.from(doc.querySelectorAll('ion-modal.auth-modal'))
                    .find(node => node.querySelector('.modal-container')) as HTMLElement;
                const panel = modal.querySelector('.modal-container') as HTMLElement;
                const panelBox = panel.getBoundingClientRect();

                expect(panelBox.right, 'panel right edge').to.be.at.most(viewportWidth + 1);
                expect(panelBox.left, 'panel left edge').to.be.at.least(-1);
                // Wide screens keep the 440px drawer; at 600px and under the
                // panel takes the full width on purpose.
                const widestAllowed = viewportWidth > 600 ? 440 : viewportWidth;
                expect(panelBox.width, 'panel width').to.be.at.most(widestAllowed + 1);
                expect(panel.scrollWidth, 'panel scrollWidth').to.be.at.most(Math.ceil(panelBox.width) + 1);

                // The form itself sits inside the panel, padding included.
                ['.login-field', '.auth-btn', '.modal-title', '.auth-switch'].forEach(selector => {
                    const el = panel.querySelector(selector) as HTMLElement;
                    const box = el.getBoundingClientRect();
                    expect(box.right, `${selector} right edge`).to.be.at.most(panelBox.right);
                    expect(box.left, `${selector} left edge`).to.be.at.least(panelBox.left);
                });
            });
        });
    });
});
