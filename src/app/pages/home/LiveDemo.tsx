import Section from "@/app/components/Section/Section"


const LiveDemo = () => {
    return (<Section title='Live Demo' id="live-demo">
        <p>This demo connects up with <code>todoList</code> and <code>countDown</code> tools.</p>
        <div className="bg--primary">
            <div className="flex--row">
                <div className="chat-history border-right flex--1 padding--small">chat history</div>
                <div className="workpanel width--3 padding--small">
                    <ul className="accordian">
                        <li className="accordian__item"><code>todoList</code></li>
                        <li className="accordian__item"><code>countDown</code></li>
                        <li className="accordian__item">Tools Config</li>
                    </ul>
                </div>
            </div>

            <div className="border-top padding--small">            
                <input className='input--text padding--small' type="text"></input>
                <div className="button-group">
                    <button className="button padding--small">send</button>
                    <button className="button padding--small">clear memory</button>
                </div>
                
            </div>
                <p className="border-top padding--small"><i>Use @ to shortcut tools</i></p>                
            
        </div>
    </Section>)
}

export default LiveDemo