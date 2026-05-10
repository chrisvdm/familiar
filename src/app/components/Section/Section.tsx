const Section = ({title, children, id = ''}: {title: string, children: any, id?: string}) => (
      <section className="section" id={id}>
        <header className="section__header">
          <h2 className="section__title">{title}</h2>
        </header>
        <div className='section__content'>

        </div>
        {children}
      </section>
)

export default Section