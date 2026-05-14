"use client"

import { useState } from "react"

import Section from "@/app/components/Section/Section"
import Code from "@/app/components/Code/Code"

const LiveDemo = () => {
    const [open, setOpen] = useState('')

    const handleAccordianClick = (item = '') => {
        console.log("item:", item)
        const newItem = item === open ? '' : item
        setOpen(newItem)
    }

    return (<Section title='Live Demo' id="live-demo">
        <p>This demo connects up with <code>todoList</code> and <code>countDown</code> tools.</p>
        <div className="live-demo bg--primary flex--column">
            <div className="flex--row flex--1">
                <div className="chat-history border-right flex--1 padding--small">chat history</div>
                <div className="workpanel width--3 padding--small">
                    <ul className="accordian flex--gap padding--small">
                        <h4>Tools</h4>
                        <li className="accordian__item " role="button" onClick={() => handleAccordianClick('todoList')}><code>todoList</code></li>
                        {open === 'todoList' && (
                            <div className="accordian__item__content  padding--small border-radius">
                                todoList results
                            </div>
                        )}
                        <li className="accordian__item " onClick={() => handleAccordianClick('countDown')}><code>countDown</code></li>
                        {open === 'countDown' && (
                            <div className="accordian__item__content  padding--small border-radius">
                                todoList results
                            </div>
                        )}
                        <li className="accordian__item " onClick={() => handleAccordianClick('json')}><h4>Tools config json</h4></li>
                        {open === 'json' && (
                            <div className="accordian__item__content  padding--small border-radius">
                            {`{
                                [
                                    name: "todoList"
                                ],[
                                    name: "countDown"
                                ]}`}
                                
                            </div>
                        )}
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