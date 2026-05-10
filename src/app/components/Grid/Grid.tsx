const Grid = ({columns, rows}: {columns?:string[], rows: any [][]}) => {
return (
    <div className="grid">
          <div className="grid__row grid__row--header">
            {columns?.map((col, index) => (
                <div key={index} className="grid__cell">{col}</div>
            ))}
          </div>
          {rows.map((row, index) => (
            <div key={index} className="grid__row">
              {row.map((column, i) => (
                <div key={i} className="grid__cell">{column}</div>
              ))}
            </div>
          ))}
        </div>
    )
}

export default Grid