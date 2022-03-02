/* global axios */

/* global Hammer */

// Axios object to access server 

var server = axios.create({
		headers: { "Content-Type": "application/json" },
		baseURL: 'DOCUMENT_API_URL'
	});
	
function bind(element, datum) {
    console.log(JSON.stringify(datum));
    for (let fieldName in datum) {
        let value = datum[fieldName];
        if (typeof value === 'object') {
            for (let nestedFieldName in value) {
                let field = element.querySelector('[data-field-name="' + fieldName + '.' + nestedFieldName + '"]');
                if (field != null) {
                    field.innerHTML = value[nestedFieldName];
                }
            }            
        } else {
            let field = element.querySelector('[data-field-name="' + fieldName + '"]');
            if (field != null) {
                field.innerHTML = datum[fieldName];
            }
        }
    }
} 

function bindToTable(table, template, data, onclick) {
    
    // Remove rows from the table
    
    while (table.firstChild) {
        table.removeChild(table.lastChild);
    }
    
    // Insert new rows into the table
    
    for (let i = 0; i < data.length; i++) {
        let datum = data[i];
        let row = template.cloneNode(true);
        row.classList.remove('template');        
        bind(row, datum);
        table.appendChild(row);
        row.onclick = () => {
            onclick(datum);
        }
    }
}

class App {
    
    static init(views) {
        PickingListsState.init(views[0]);
        LineToPickState.init(views[1]);
        LinePickedState.init(views[2]);
        ErrorState.init(views[3]);
    }
    
    static async start() {
        await PickingListsState.enter();
    }
}

class State {
    
    static init(view) {
        this.view = view;
    }
    
    static async enter() {
		let old = document.querySelector('div.view[current]');
		if (old != null) {
			old.style.display = 'none';
			old.removeAttribute('current');
		}
		this.view.style.display = 'block';
		this.view.setAttribute('current', 'true');		
    }

}

class Storage {
    
    static persist(pickingListId, lines) {
        window.localStorage.setItem(pickingListId, JSON.stringify(lines));            
    }
    
    static load(pickingListId) {
		let s = window.localStorage.getItem(pickingListId);
		if (s == null) {
			return null;	
		}
        return JSON.parse(s);
    }

	static clear(pickingListId) {
		window.localStorage.removeItem(pickingListId);
	}
}

class PickingListsState extends State {
    
    static async enter() {
	
		await super.enter();
	        
        let response = await server.get('/pendingMultiPickingLists');
        let pickingLists = response.data;

        let table = this.view.querySelector('.table[data-table-name="pickingListTable"]');
        let row = this.view.querySelector('.row.template[data-table-name="pickingListTable"]');
        
        let choose = async (pickingList) => {
            
            let response = await server.put('/multiPickingLists/' + pickingList.id + '/workStatus', JSON.stringify('ON_GOING'), { validateStatus: function (status) {
        		    return status == 200 || status == 422; 
        		}});
        	
        	if (response.status == 422) {
	
        	    await ErrorState.enter('pickingListLocked');
        	
        	} else {
        	
        	    let multiPickingList = response.data;

                // Mark all lines as not done
    
                let lines = multiPickingList.shipmentLinesToPack;
                for (let i = 0; i < lines.length; i++) {
                    lines[i].done = false;
                }
    
//				Storage.persist(pickingList.id, lines);

                if (lines.length == 0) {
                    await ErrorState.enter('noLinesToPick');
                } else {
					await LineToPickState.enter(pickingList.id, lines, 0);
                }
                
        	}
        };
        
        let refresh = async () => {
            await PickingListsState.enter();            
        };

        let refreshButton = this.view.querySelector('button[data-action="refresh"');
        refreshButton.onclick = refresh;

        bindToTable(table, row, pickingLists, choose);

    }

}

class LineState extends State {

    static async enter(pickingListId, lines, index) {

		super.enter();        

		let line = lines[index];
        bind(this.view, line);
        
		let optionsPanel = this.view.querySelector('#optionsPanel');
		optionsPanel.style.display = 'none';

        let next = async (e) => {
			e.preventDefault();
            if (index < lines.length - 1) {
				if (lines[index + 1].done) {
	                LinePickedState.enter(pickingListId, lines, index + 1);               
				} else {
	                LineToPickState.enter(pickingListId, lines, index + 1);               
				}
            }
        };
        
        let previous = async (e) => {
			e.preventDefault();
            if (index > 0) {
				if (lines[index - 1].done) {
					LinePickedState.enter(pickingListId, lines, index - 1);	
				} else {
	                LineToPickState.enter(pickingListId, lines, index - 1);
				}
            }
        };
        
        let hammer = new Hammer(this.view, { taps: 2 });
        hammer.on("swipeleft", next);
        hammer.on("swiperight", previous);

        let previousButton = this.view.querySelector('button[data-action="previous"]');
        if (index > 0) {     
    		previousButton.disabled = false;
    		previousButton.onclick = previous;
        } else {
            previousButton.disabled = true;
        }
		
        let nextButton = this.view.querySelector('button[data-action="next"]');
        if (index < lines.length - 1) {
    		nextButton.disabled = false;
    		nextButton.onclick = next;
        } else {
            nextButton.disabled = true;
        }

		let optionsButton = this.view.querySelector('button[data-action="options"]');
		optionsButton.onclick = () => {
			if (optionsPanel.style.display == 'none') {
				optionsPanel.style.display = 'block';
			} else {
				optionsPanel.style.display = 'none';
			}
		}

    }    
        
}

class LinePickedState extends LineState {

    static async enter(pickingListId, lines, index) {
        
        super.enter(pickingListId, lines, index);

        let undo = async () => {
            lines[index].done = false;     
//			Storage.persist(pickingListId, lines);   
            LineToPickState.enter(pickingListId, lines, index);
        };
        
        let undoButton = this.view.querySelector('button[data-action="undo"]');
        undoButton.onclick = undo;

    }
    
}

class LineToPickState extends LineState {
    
    static async enter(pickingListId, lines, index) {
        
        super.enter(pickingListId, lines, index);

        let confirm = async () => {
        
            lines[index].done = true; 

//			Storage.persist(pickingListId, lines);       
            
            let i = 0;
            let found = false;
            while (i < lines.length && !found) {
                let line = lines[i];
                if (!line.done) {
                    found = true;
                } else {
                    i++;
                }
            }
            
            if (found) {
                LineToPickState.enter(pickingListId, lines, i);
            } else {
	            await server.put('/multiPickingLists/' + pickingListId + '/workStatus', JSON.stringify('DONE'));
//                Storage.clear(pickingListId);
				await PickingListsState.enter();
            }
            
        };
        
        let confirmButton = this.view.querySelector('button[data-action="confirm"]');
        confirmButton.onclick = confirm;

    }
}

class ErrorState extends State {
    
    static async enter(error) {
	
		super.enter();
	
        let errorMessage = this.view.querySelector('[data-error="' + error + '"]'); 
        errorMessage.style.display = 'block';
        
        let acknowledgeButton = this.view.querySelector('button[data-action="acknowledge"]');
        acknowledgeButton.onclick = () => {
                errorMessage.style.display = 'none';
                PickingListsState.enter();
            }; 
    }
}

