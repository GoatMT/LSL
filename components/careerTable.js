import { escapeHTML } from "../js/utils.js";

export function renderPlayerCareerTable(rows = []) {
  if (!rows.length) return `<div class="empty-state">No career rows found for this player.</div>`;
  const totals = rows.reduce(
    (sum, row) => ({
      points: sum.points + (Number(row.points) || 0),
      gamesPlayed: sum.gamesPlayed + (Number(row.gamesPlayed) || 0),
      goals: sum.goals + (Number(row.goals) || 0),
      shots: sum.shots + (Number(row.shots) || 0),
      wins: sum.wins + (Number(row.wins) || 0),
      ties: sum.ties + (Number(row.ties) || 0),
      losses: sum.losses + (Number(row.losses) || 0),
      assists: sum.assists + (Number(row.assists) || 0),
    }),
    { points: 0, gamesPlayed: 0, goals: 0, shots: 0, wins: 0, ties: 0, losses: 0, assists: 0 }
  );
  return `
    <div class="table-wrap player-career-wrap">
      <table class="data-table player-career-table">
        <colgroup>
          <col class="career-year">
          <col class="career-team">
          <col class="career-stat">
          <col class="career-games">
          <col class="career-stat">
          <col class="career-stat">
          <col class="career-stat">
          <col class="career-stat">
          <col class="career-stat">
          <col class="career-stat">
        </colgroup>
        <thead>
          <tr>
            <th>Year</th><th>Team</th><th class="num">Points</th><th class="num">Games</th>
            <th class="num">Goals</th><th class="num">Shots</th><th class="num">Wins</th><th class="num">Ties</th>
            <th class="num">Losses</th><th class="num">Assists</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td data-label="Year">${escapeHTML(row.year)}</td>
                  <td data-label="Team">${escapeHTML(row.team)}</td>
                  <td class="num" data-label="Points">${row.points}</td>
                  <td class="num" data-label="Games Played">${row.gamesPlayed}</td>
                  <td class="num" data-label="Goals">${row.goals}</td>
                  <td class="num" data-label="Shots">${row.shots}</td>
                  <td class="num" data-label="Wins">${row.wins}</td>
                  <td class="num" data-label="Ties">${row.ties}</td>
                  <td class="num" data-label="Losses">${row.losses}</td>
                  <td class="num" data-label="Assists">${row.assists}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr class="career-total-row">
            <td data-label="Year">Total</td>
            <td data-label="Team">All seasons</td>
            <td class="num" data-label="Points">${totals.points}</td>
            <td class="num" data-label="Games Played">${totals.gamesPlayed}</td>
            <td class="num" data-label="Goals">${totals.goals}</td>
            <td class="num" data-label="Shots">${totals.shots}</td>
            <td class="num" data-label="Wins">${totals.wins}</td>
            <td class="num" data-label="Ties">${totals.ties}</td>
            <td class="num" data-label="Losses">${totals.losses}</td>
            <td class="num" data-label="Assists">${totals.assists}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

export function renderCoachCareerTable(rows = []) {
  if (!rows.length) return `<div class="empty-state">No career rows found for this coach.</div>`;
  return `
    <div class="table-wrap mobile-card-table-wrap">
      <table class="data-table mobile-card-table">
        <thead>
          <tr>
            <th>Year</th><th>Team</th><th class="num">Points</th><th class="num">Games Played</th>
            <th class="num">Wins</th><th class="num">Ties</th><th class="num">Losses</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td data-label="Year">${escapeHTML(row.year)}</td>
                  <td data-label="Team">${escapeHTML(row.team)}</td>
                  <td class="num" data-label="Points">${row.points}</td>
                  <td class="num" data-label="Games Played">${row.gamesPlayed}</td>
                  <td class="num" data-label="Wins">${row.wins}</td>
                  <td class="num" data-label="Ties">${row.ties}</td>
                  <td class="num" data-label="Losses">${row.losses}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}
