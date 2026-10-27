export function createNonTeachingDaysRepository(database) {
  return {
    async list(academicYear, fromDate, toDate) {
      const result = await database.query(
        `SELECT day_date::text AS date
           FROM non_teaching_days
          WHERE academic_year = $1
            AND day_date BETWEEN $2::date AND $3::date
          ORDER BY day_date`,
        [academicYear, fromDate, toDate],
      );
      return result.rows.map((row) => row.date);
    },

    async includes(academicYear, date) {
      const result = await database.query(
        `SELECT 1
           FROM non_teaching_days
          WHERE academic_year = $1
            AND day_date = $2::date`,
        [academicYear, date],
      );
      return result.rowCount > 0;
    },
  };
}
