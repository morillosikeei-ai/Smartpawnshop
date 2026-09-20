/**
 * Admin > Reports > Table: search, date filter, paging and the View dialog.
 * Signs in through the real API as the seeded admin.
 */
describe('Reports table tab', () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.request('POST', 'http://localhost:8000/api/login', { email: 'admin@smartpawn.ph', password: 'admin123' }).then(({ body }) => {
      cy.visit('/admin/dashboard', {
        onBeforeLoad(win) {
          win.localStorage.setItem('smartpawn_api_token', body.token);
          win.localStorage.setItem('smartpawn_admin', JSON.stringify(body.user));
        },
      });
    });
    cy.contains('button, a', /^\s*Reports\s*$/).click({ force: true });
    cy.contains('.admin-tabs button', 'Table').click();
    // The dev API serves one request at a time, behind the dashboard's own calls.
    cy.get('.rpt-loading', { timeout: 60000 }).should('not.exist');
  });

  it('lists records with the requested columns and opens the full record', () => {
    ['Date', 'Item', 'Category', 'Weight', 'Appraised Value', 'Pawn Amount', 'Status'].forEach((column) => {
      cy.contains('.rpt-head', column).should('exist');
    });
    cy.get('.rpt-row').should('have.length.within', 1, 10);
    cy.contains('.rpt-pagination', /Showing 1–\d+ of \d+/).should('exist');
    cy.get('.admin-content').screenshot('reports-table');

    cy.get('.rpt-row').first().contains('button', 'View').click();
    cy.contains('.rpt-detail', 'PAWN RECORD').should('be.visible');
    cy.contains('.rpt-detail', 'Pawn Amount').should('be.visible');
    cy.wait(400);
    cy.screenshot('reports-table-view', { capture: 'viewport' });
    cy.get('.rpt-detail button[aria-label="Close record"]').click();
  });

  it('narrows the list by search and by date', () => {
    cy.get('.rpt-search input').type('zzzz-no-such-record');
    cy.contains('.rpt-table', 'No records match these filters.').should('exist');
    cy.get('.rpt-search input').clear();
    cy.get('.rpt-dates input').first().type('2099-01-01');
    cy.contains('.rpt-table', 'No records match these filters.').should('exist');
    cy.contains('.rpt-clear', 'Clear').click();
    cy.get('.rpt-row').should('have.length.at.least', 1);
  });
});
