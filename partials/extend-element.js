"use strict";

/**
 * Provides several methods that override native Element-methods to work with the vdom.
 *
 *
 * <i>Copyright (c) 2014 ITSA - https://github.com/itsa</i>
 * <br>
 * New BSD License - http://choosealicense.com/licenses/bsd-3-clause/
 *
 * @module vnode
 * @submodule extend-element
 * @class Element
 * @since 0.0.1
*/


require('../css/element.css');
require('js-ext/lib/object.js');
require('js-ext/lib/string.js');
require('polyfill/lib/window.console.js');
require('polyfill/lib/weakmap.js');
require('polyfill/lib/mutationobserver.js'); // needs weakmap


module.exports = function (window) {

    var NAME = '[extend-element]: ',
        ElementArray = require('./element-array.js')(window),
        domNodeToVNode = require('./node-parser.js')(window),
        htmlToVNodes = require('./html-parser.js')(window),
        vNodeProto = require('./vnode.js')(window),
        NS = require('./vdom-ns.js')(window),
        DOCUMENT = window.document,
        nodeids = NS.nodeids,
        arrayIndexOf = Array.prototype.indexOf,
        POSITION = 'position',
        EL_ = 'el-',
        BLOCK = EL_+'block',
        BORDERBOX = EL_+'borderbox',
        NO_TRANS = EL_+'notrans',
        INVISIBLE = EL_+'invisible',
        HIDDEN = EL_+'hidden',
        REGEXP_NODE_ID = /^#\S+$/,
        LEFT = 'left',
        TOP = 'top',
        BORDER = 'border',
        WIDTH = 'width',
        HEIGHT = 'height',
        STRING = 'string',
        CLASS = 'class',
        STYLE = 'style',
        OVERFLOW = 'overflow',
        SCROLL = 'scroll',
        BORDER_LEFT_WIDTH = BORDER+'-left-'+WIDTH,
        BORDER_RIGHT_WIDTH = BORDER+'-right-'+WIDTH,
        BORDER_TOP_WIDTH = BORDER+'-top-'+WIDTH,
        BORDER_BOTTOM_WIDTH = BORDER+'-bottom-'+WIDTH,
        NUMBER = 'number',
        PX = 'px',
        setupObserver,
        SIBLING_MATCH_CHARACTER = {
            '+': true,
            '~': true
        },
        htmlToVFragments = function(html) {
            var vnodes = htmlToVNodes(html, vNodeProto),
                len = vnodes.length,
                vnode, i, bkpAttrs, bkpVChildNodes;
            for (i=0; i<len; i++) {
                vnode = vnodes[i];
                // same tag --> only update what is needed
                bkpAttrs = vnode.attrs;
                bkpVChildNodes = vnode.vChildNodes;

                // reset, to force creation of inner domNodes:
                vnode.attrs = {};
                vnode.vChildNodes = [];

                // next: sync the vnodes:
                vnode._setAttrs(bkpAttrs);
                vnode._setChildNodes(bkpVChildNodes);
            }
            return {
                isFragment: true,
                vnodes: vnodes
            };
        },
        toCamelCase = function(input) {
            return input.toLowerCase().replace(/-(.)/g, function(match, group) {
                return group.toUpperCase();
            });
        },
        fromCamelCase = function(input) {
            return input.replace(/[a-z]([A-Z])/g, function(match, group) {
                return match[0]+'-'+group.toLowerCase();
            });
        },
        classListProto = {
            add: function(className) {
                // we do not use the property className, but setAttribute, because setAttribute can be hacked by other modules like `vdom`
                // note: `this` is the returned object which is NOT the Elementinstance
                var thisobject = this,
                    element = thisobject.element,
                    doSet = function(cl) {
                        var clName = element.vnode.attrs[CLASS] || '';
                        // we do not use the property className, but setAttribute, because setAttribute can be hacked by other modules like `vdom`
                        thisobject.contains(cl) || (element.setAttribute(CLASS, clName+((clName.length>0) ? ' ' : '') + cl));
                    };
                if (typeof className === STRING) {
                    doSet(className);
                }
                else if (Array.isArray(className)) {
                    className.forEach(doSet);
                }
            },
            remove: function(className) {
                var element = this.element,
                    doRemove = function(cl) {
                        var clName = element.vnode.attrs[CLASS] || '',
                            regexp = new RegExp('(?:^|\\s+)' + cl + '(?:\\s+|$)', 'g');
                        // we do not use the property className, but setAttribute, because setAttribute can be hacked by other modules like `vdom`
                        // note: `this` is the returned object which is NOT the Elementinstance
                        element.setAttribute(CLASS, clName.replace(regexp, ' ').trim());
                    };
                if (typeof className === STRING) {
                    doRemove(className);
                }
                else if (Array.isArray(className)) {
                    className.forEach(doRemove);
                }
                (element.vnode.attrs[CLASS]==='') && element.removeAttr(CLASS);
            },
            toggle: function(className, forceState) {
                // we do not use the property className, but setAttribute, because setAttribute can be hacked by other modules like `vdom`
                // note: `this` is the returned object which is NOT the Elementinstance
                var thisobject = this,
                    doToggle = function(cl) {
                        if (typeof forceState === 'boolean') {
                            forceState ? thisobject.add(cl) : thisobject.remove(cl);
                        }
                        else {
                            thisobject.contains(cl) ? thisobject.remove(cl) : thisobject.add(cl);
                        }
                    };
                if (typeof className === STRING) {
                    doToggle(className);
                }
                else if (Array.isArray(className)) {
                    className.forEach(doToggle);
                }
            },
            contains: function(className) {
                // we do not use the property className, but setAttribute, because setAttribute can be hacked by other modules like `vdom`
                // note: `this` is the returned object which is NOT the Elementinstance.
                // May be an Array of classNames, which all needs to be present.
                return this.element.vnode.hasClass(className);
            },
            item: function(index) {
                var items = this.element.vnode.attrs['class'].split(' ');
                return items[index];
            },
            _init: function(element) {
                this.element = element;
            }
        },
        treeWalkerProto = {
            _init: function(element, whatToShow, filter) {
                var instance = this;
                if (typeof filter !== 'function') {
                    // check if it is a NodeFilter-object
                    filter && filter.acceptNode && (filter=filter.acceptNode);
                }
                (typeof filter==='function') || (filter=null);
                instance.vNodePointer = element.vnode;
                instance._root = element;
                whatToShow || (whatToShow=-1); // -1 equals NodeFilter.SHOW_ALL
                (whatToShow===-1) && (whatToShow=133);
                instance._whatToShow = whatToShow; // making it accessable for the getter `whatToShow`
                instance._filter = filter; // making it accessable for the getter `filter`
            },
            _match: function(vnode, forcedVisible) {
                var whatToShow = this._whatToShow,
                    filter = this._filter,
                    showElement = ((whatToShow & 1)!==0),
                    showComment = ((whatToShow & 128)!==0),
                    showText = ((whatToShow & 4)!==0),
                    typeMatch = (showElement && (vnode.nodeType===1)) || (showComment && (vnode.nodeType===8)) || (showText && (vnode.nodeType===3)),
                    visibleMatch = !forcedVisible || (window.getComputedStyle(vnode.domNode).display!=='none'),
                    funcMatch = filter ? filter(vnode.domNode) : true;
                return typeMatch && visibleMatch && funcMatch;
            },
            firstChild: function() {
                var instance = this,
                    foundVNode = instance.vNodePointer.vFirstChild;
                while (foundVNode && !instance._match(foundVNode)) {
                    foundVNode = foundVNode.vNext;
                }
                foundVNode && (instance.vNodePointer=foundVNode);
                return foundVNode && foundVNode.domNode;
            },
            lastChild: function() {
                var instance = this,
                    foundVNode = instance.vNodePointer.vLastChild;
                while (foundVNode && !instance._match(foundVNode)) {
                    foundVNode = foundVNode.vPrevious;
                }
                foundVNode && (instance.vNodePointer=foundVNode);
                return foundVNode && foundVNode.domNode;
            },
            nextNode: function() {
                var instance = this,
                    foundVNode = instance.vNodePointer.vNext;
                while (foundVNode && !instance._match(foundVNode, true)) {
                    foundVNode = foundVNode.vNext;
                }
                foundVNode && (instance.vNodePointer=foundVNode);
                return foundVNode && foundVNode.domNode;
            },
            nextSibling: function() {
                var instance = this,
                    foundVNode = instance.vNodePointer.vNext;
                while (foundVNode && !instance._match(foundVNode)) {
                    foundVNode = foundVNode.vNext;
                }
                foundVNode && (instance.vNodePointer=foundVNode);
                return foundVNode && foundVNode.domNode;
            },
            parentNode: function() {
                var instance = this,
                    foundVNode = instance.vNodePointer.vParent;
                (foundVNode!==instance._root) && (instance.vNodePointer=foundVNode);
                return foundVNode && foundVNode.domNode;
            },
            previousNode: function() {
                var instance = this,
                    foundVNode = instance.vNodePointer.vPrevious;
                while (foundVNode && !instance._match(foundVNode, true)) {
                    foundVNode = foundVNode.vPrevious;
                }
                foundVNode && (instance.vNodePointer=foundVNode);
                return foundVNode && foundVNode.domNode;
            },
            previousSibling: function() {
                var instance = this,
                    foundVNode = instance.vNodePointer.vPrevious;
                while (foundVNode && !instance._match(foundVNode)) {
                    foundVNode = foundVNode.vPrevious;
                }
                foundVNode && (instance.vNodePointer=foundVNode);
                return foundVNode && foundVNode.domNode;
            }
        };

    require('window-ext')(window);

    Object.defineProperties(treeWalkerProto, {
        'currentNode': {
            get: function() {
                return this.vNodePointer.domNode;
            }
        },
        'filter': {
            get: function() {
                return this._filter;
            }
        },
        'root': {
            get: function() {
                return this._root;
            }
        },
        'whatToShow': {
            get: function() {
                return this._whatToShow;
            }
        }
    });

    // NOTE: `vnode` should be a property of Node, NOT Element
    /**
     * Reference to the vnode-object that represents the Node
     *
     * (will autogenerate a vnode, should it not exists)
     *
     * @for Node
     * @property vnode
     * @type vnode
     * @since 0.0.1
     */
    Object.defineProperty(window.Node.prototype, 'vnode', {
       get: function() {
            var instance = this,
                vnode = instance._vnode,
                parentNode, parentVNode, index;
            if (!vnode) {
                vnode = instance._vnode = domNodeToVNode(instance);
                parentNode = instance.parentNode;
                 // parentNode.vnode will be an existing vnode, because it runs through the same getter
                // it will only be `null` if `html` is not virtualised
                parentVNode = parentNode && parentNode.vnode;
                if (parentVNode) {
                    // set the vnode at the right position of its children:
                    index = arrayIndexOf.call(parentNode.childNodes, instance);
                    vnode._moveToParent(parentVNode, index);
                }
            }
            return vnode;
        },
        set: function() {} // NOOP but needs to be there, otherwise we could clone any domNodes
    });

    (function(ElementPrototype) {
       /**
        * Appends an Element or an Element's string-representation at the end of Element's innerHTML, or before the `refElement`.
        *
        * @for Element
        * @method append
        * @param content {Element|ElementArray|String} content to append
        * @param [escape] {Boolean} whether to insert `escaped` content, leading it into only text inserted
        * @param [refElement] {Element} reference Element where the content should be appended
        * @return {Element} the created Element (or the last when multiple)
        * @since 0.0.1
        */
        ElementPrototype.append = function(content, escape, refElement) {
            var instance = this,
                vnode = instance.vnode,
                i, len, item, createdElement, vnodes, vRefElement,
            doAppend = function(oneItem) {
                escape && (oneItem=DOCUMENT.createTextNode(oneItem.getOuterHTML()));
                createdElement = refElement ? vnode._insertBefore(oneItem.vnode, refElement.vnode) : vnode._appendChild(oneItem.vnode);
            };
            vnode._noSync();
            if (refElement && (vnode.vChildNodes.indexOf(refElement.vnode)!==-1)) {
                vRefElement = refElement.vnode.vNext;
                refElement = vRefElement && vRefElement.domNode;
            }
            (typeof content===STRING) && (content=htmlToVFragments(content));
            if (Array.isArray(content)) {
                len = content.length;
                for (i=0; i<len; i++) {
                    item = content[i];
                    doAppend(item);
                }
            }
            else if (content.isFragment) {
                vnodes = content.vnodes;
                len = vnodes.length;
                for (i=0; i<len; i++) {
                    doAppend(vnodes[i].domNode);
                }
            }
            else {
                doAppend(content);
            }
            return createdElement;
        };

        /**
         * Adds a node to the end of the list of childNodes of a specified parent node.
         *
         * @method appendChild
         * @param content {Element|ElementArray|String} content to append
         * @param [escape] {Boolean} whether to insert `escaped` content, leading it into only text inserted
         * @return {Element} the Element that was appended
         */
        ElementPrototype._appendChild = ElementPrototype.appendChild;
        ElementPrototype.appendChild = function(domNode, escape) {
            return this.append(domNode, escape);
        };

       /**
        * Returns a duplicate of the node. Use cloneNode(true) for a `deep` clone.
        *
        * @method cloneNode
        * @param [deep] {Boolean} whether to perform a `deep` clone: with all descendants
        * @return {Element} a clone of this Element
        * @since 0.0.1
        */
        ElementPrototype._cloneNode = ElementPrototype.cloneNode;
        ElementPrototype.cloneNode = function(deep) {
            var instance = this,
                vnode = instance.vnode,
                cloned = instance._cloneNode(deep),
                cloneData = function(srcVNode, targetVNode) {
                    if (srcVNode._data) {
                        Object.defineProperty(targetVNode, '_data', {
                            configurable: false,
                            enumerable: false,
                            writable: false,
                            value: {} // `writable` is false means we cannot chance the value-reference, but we can change {}'s properties itself
                        });
                        targetVNode._data.merge(srcVNode._data);
                    }
                },
                cloneDeepData = function(srcVNode, targetVNode) {
                    var srcVChildren = srcVNode.vChildren,
                        targetVChildren = targetVNode.vChildren,
                        len = srcVChildren.length,
                        i, childSrcVNode, childTargetVNode;
                    for (i=0; i<len; i++) {
                        childSrcVNode = srcVChildren[i];
                        childTargetVNode = targetVChildren[i];
                        cloneData(childSrcVNode, childTargetVNode);
                        childSrcVNode.hasVChildren() && cloneDeepData(childSrcVNode, childTargetVNode);
                    }
                };
            cloned.vnode = domNodeToVNode(cloned);
            cloneData(vnode, cloned.vnode);
            // if deep, then we need to merge _data of all deeper nodes
            deep && vnode.hasVChildren() && cloneDeepData(vnode, cloned.vnode);
            return cloned;
        };

        /**
         * Compares the position of the current node against another node in any other document.
         *
         * Returnvalues are a composition of the following bitwise values:
         * <ul>
         *     <li>Node.DOCUMENT_POSITION_DISCONNECTED === 1 (one of the Elements is not part of the dom)</li>
         *     <li>Node.DOCUMENT_POSITION_PRECEDING === 2 (this Element comes before otherElement)</li>
         *     <li>Node.DOCUMENT_POSITION_FOLLOWING === 4 (this Element comes after otherElement)</li>
         *     <li>Node.DOCUMENT_POSITION_CONTAINS === 8 (otherElement trully contains -not equals- this Element)</li>
         *     <li>Node.DOCUMENT_POSITION_CONTAINED_BY === 16 (Element trully contains -not equals- otherElement)</li>
         * </ul>
         *
         * @method compareDocumentPosition
         * @param otherElement {Element}
         * @return {Number} A bitmask, use it this way: if (thisNode.compareDocumentPosition(otherNode) & Node.DOCUMENT_POSITION_FOLLOWING) {// otherNode is following thisNode}
         */
        ElementPrototype.compareDocumentPosition = function(otherElement) {
            // see http://ejohn.org/blog/comparing-document-position/
            var instance = this,
                parent, index1, index2, vChildNodes;
            if (instance===otherElement) {
                return 0;
            }
            if (!DOCUMENT.contains(instance) || !DOCUMENT.contains(otherElement)) {
                return 1;
            }
            else if (instance.contains(otherElement)) {
                return 20;
            }
            else if (otherElement.contains(instance)) {
                return 10;
            }
            parent = instance.getParent();
            vChildNodes = parent.vnode.vChildNodes;
            index1 = vChildNodes.indexOf(instance.vnode);
            index2 = vChildNodes.indexOf(otherElement.vnode);
            if (index1<index2) {
                return 2;
            }
            else {
                return 4;
            }
        };

        /**
         * Indicating whether this Element contains OR equals otherElement.
         *
         * @method contains
         * @param otherElement {Element}
         * @return {Boolean} whether this Element contains OR equals otherElement.
         */
        ElementPrototype.contains = function(otherElement) {
            if (otherElement===this) {
                return true;
            }
            return this.vnode.contains(otherElement.vnode);
        };

        /**
         * Returns a newly created TreeWalker object with this Element as root.
         *
         * The TreeWalker is life presentation of the dom. It gets updated when the dom changes.
         *
         * @method createTreeWalker
         * @param root {Element} The root node at which to begin the NodeIterator's traversal.
         * @param [whatToShow] {Number} Filter specification constants from the NodeFilter DOM interface, indicating which nodes to iterate over.
         * You can use or sum one of the next properties:
         * <ul>
         *   <li>window.NodeFilter.SHOW_ALL === -1</li>
         *   <li>window.NodeFilter.SHOW_ELEMENT === 1</li>
         *   <li>window.NodeFilter.SHOW_COMMENT === 128</li>
         *   <li>window.NodeFilter.SHOW_TEXT === 4</li>
         * </ul>
         *
         * A treewalker has the next methods:
         * <ul>
         *   <li>treewalker.firstChild()</li>
         *   <li>treewalker.lastChild()</li>
         *   <li>treewalker.nextNode()</li>
         *   <li>treewalker.nextSibling()</li>
         *   <li>treewalker.parentNode()</li>
         *   <li>treewalker.previousNode()</li>
         *   <li>treewalker.previousSibling()</li>
         * </ul>
         *
         * A treewalker has the next properties:
         * <ul>
         *   <li>treewalker.currentNode</li>
         *   <li>treewalker.filter</li>
         *   <li>treewalker.root</li>
         *   <li>treewalker.whatToShow</li>
         * </ul>
         *
         * @param [filter] {NodeFilter|function} An object implementing the NodeFilter interface or a function. See https://developer.mozilla.org/en-US/docs/Web/API/NodeFilter
         * @return {TreeWalker}
         * @since 0.0.1
         */
        ElementPrototype.createTreeWalker = function(whatToShow, filter) {
            var treeWalker = Object.create(treeWalkerProto);
            treeWalker._init(this, whatToShow, filter);
            return treeWalker;
        };

       /**
        * Sets the inline-style of the Element exactly to the specified `value`, overruling previous values.
        * Making the Element's inline-style look like: style="value".
        *
        * This is meant for a quick one-time setup. For individually inline style-properties to be set, you can use `setInlineStyle()`.
        *
        * @method defineInlineStyle
        * @param value {String} the style string to be set
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.defineInlineStyle = function(value) {
            return this.setAttr(STYLE, value);
        };

       /**
        * Empties the content of the Element.
        * Alias for thisNode.vTextContent = '';
        *
        * @method empty
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.empty = function() {
            this.setText('');
        };

        /**
         * Reference to the first of sibbling vNode's, where the related dom-node is an Element(nodeType===1).
         *
         * @method first
         * @param [cssSelector] {String} to return the first Element that matches the css-selector
         * @return {Element}
         * @since 0.0.1
         */
        ElementPrototype.first = function(cssSelector) {
            return this.vnode.vParent.firstOfVChildren(cssSelector).domNode;
        };

        /**
         * Reference to the first child-Element, where the related dom-node an Element (nodeType===1).
         *
         * @method firstOfChildren
         * @param [cssSelector] {String} to return the first Element that matches the css-selector
         * @return {Element}
         * @since 0.0.1
         */
        ElementPrototype.firstOfChildren = function(cssSelector) {
            var foundVNode = this.vnode.firstOfVChildren(cssSelector);
            return foundVNode && foundVNode.domNode;
        };

       /**
        * Forces the Element to be inside an ancestor-Element that has the `overfow="scroll" set.
        *
        * @method forceIntoNodeView
        * @param [ancestor] {Element} the Element where it should be forced into its view.
        *        Only use this when you know the ancestor and this ancestor has an `overflow="scroll"` property
        *        when not set, this method will seek through the doc-tree upwards for the first Element that does match this criteria.
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.forceIntoNodeView = function(ancestor) {
            console.log(NAME, 'forceIntoNodeView');
            var instance = this,
                parentOverflowNode = this.getParent(),
                match, left, width, right, height, top, bottom, scrollLeft, scrollTop, parentOverflowNodeX, parentOverflowNodeY,
                parentOverflowNodeStartTop, parentOverflowNodeStartLeft, parentOverflowNodeStopRight, parentOverflowNodeStopBottom, newX, newY;
            if (parentOverflowNode) {
                if (ancestor) {
                    parentOverflowNode = ancestor;
                }
                else {
                    while (parentOverflowNode && (parentOverflowNode!==DOCUMENT) && !(match=((parentOverflowNode.getStyle(OVERFLOW)===SCROLL) || (parentOverflowNode.getStyle(OVERFLOW+'-y')===SCROLL)))) {
                        parentOverflowNode = parentOverflowNode.getParent();
                    }
                }
                if (parentOverflowNode && (parentOverflowNode!==DOCUMENT)) {
                    left = instance.left;
                    width = instance.offsetWidth;
                    right = left + width;
                    height = instance.offsetHeight;
                    top = instance.top;
                    bottom = top + height;
                    scrollLeft = parentOverflowNode.scrollLeft;
                    scrollTop = parentOverflowNode.scrollTop;
                    parentOverflowNodeX = parentOverflowNode.left;
                    parentOverflowNodeY = parentOverflowNode.top;
                    parentOverflowNodeStartTop = parentOverflowNodeY+parseInt(parentOverflowNode.getStyle(BORDER_TOP_WIDTH), 10);
                    parentOverflowNodeStartLeft = parentOverflowNodeX+parseInt(parentOverflowNode.getStyle(BORDER_LEFT_WIDTH), 10);
                    parentOverflowNodeStopRight = parentOverflowNodeX+parentOverflowNode.offsetWidth-parseInt(parentOverflowNode.getStyle(BORDER_RIGHT_WIDTH), 10);
                    parentOverflowNodeStopBottom = parentOverflowNodeY+parentOverflowNode.offsetHeight-parseInt(parentOverflowNode.getStyle(BORDER_BOTTOM_WIDTH), 10);

                    if (left<parentOverflowNodeStartLeft) {
                        newX = Math.max(0, scrollLeft+left-parentOverflowNodeStartLeft);
                    }
                    else if (right>parentOverflowNodeStopRight) {
                        newX = scrollLeft + right - parentOverflowNodeStopRight;
                    }

                    if (top<parentOverflowNodeStartTop) {
                        newY = Math.max(0, scrollTop+top-parentOverflowNodeStartTop);
                    }
                    else if (bottom>parentOverflowNodeStopBottom) {
                        newY = scrollTop + bottom - parentOverflowNodeStopBottom;
                    }

                    if ((newX!==undefined) || (newY!==undefined)) {
                        parentOverflowNode.scrollTo((newX!==undefined) ? newX : scrollLeft,(newY!==undefined) ? newY : scrollTop);
                    }
                }
            }
            return instance;
        };

       /**
        * Forces the Element to be inside the window-view. Differs from `scrollIntoView()` in a way
        * that `forceIntoView()` doesn't change the position when it's inside the view, whereas
        * `scrollIntoView()` sets it on top of the view.
        *
        * @method forceIntoView
        * @param [notransition=false] {Boolean} set true if you are sure positioning is without transition.
        *        this isn't required, but it speeds up positioning. Only use when no transition is used:
        *        when there is a transition, setting this argument `true` would miscalculate the position.
        * @param [rectangle] {Object} Set this if you have already calculated the window-rectangle (used for preformance within drag-drop)
        * @param [rectangle.x] {Number} scrollLeft of window
        * @param [rectangle.y] {Number} scrollTop of window
        * @param [rectangle.w] {Number} width of window
        * @param [rectangle.h] {Number} height of window
        * @chainable
        * @since 0.0.2
        */
        ElementPrototype.forceIntoView = function(notransition, rectangle) {
            console.log(NAME, 'forceIntoView');
            var instance = this,
                left = instance.left,
                width = instance.offsetWidth,
                right = left + width,
                height = instance.offsetHeight,
                top = instance.top,
                bottom = top + height,
                windowLeft, windowTop, windowRight, windowBottom, newX, newY;
            if (rectangle) {
                windowLeft = rectangle.x;
                windowTop = rectangle.y;
                windowRight = rectangle.w;
                windowBottom = rectangle.h;
            }
            else {
                windowLeft = window.getScrollLeft();
                windowTop = window.getScrollTop();
                windowRight = windowLeft + window.getWidth();
                windowBottom = windowTop + window.getHeight();
            }

            if (left<windowLeft) {
                newX = Math.max(0, left);
            }
            else if (right>windowRight) {
                newX = windowLeft + right - windowRight;
            }
            if (top<windowTop) {
                newY = Math.max(0, top);
            }
            else if (bottom>windowBottom) {
                newY = windowTop + bottom - windowBottom;
            }

            if ((newX!==undefined) || (newY!==undefined)) {
                window.scrollTo((newX!==undefined) ? newX : windowLeft, (newY!==undefined) ? newY : windowTop);
            }
            return instance;
        };

        /**
         * Gets an ElementArray of vElements that lie within this Element and match the css-selector.
         *
         * @method getAll
         * @param cssSelector {String} css-selector to match
         * @return {ElementArray} ElementArray of vElements that match the css-selector
         * @since 0.0.1
         */
        ElementPrototype.getAll = function(cssSelector) {
            return this.querySelectorAll(cssSelector);
        };

       /**
        * Gets an attribute of the Element.
        *
        * Alias for getAttribute().
        *
        * @method getAttr
        * @param attributeName {String}
        * @return {String|null} value of the attribute
        * @since 0.0.1
        */
        ElementPrototype.getAttr = function(attributeName) {
            return this.vnode.attrs[attributeName] || null;
        };

        /**
         * Returns all attributes as defined as an key/value object.
         *
         * @method getAttrs
         * @param attributeName {String}
         * @return {Object} all attributes as on Object
         * @since 0.0.1
         */
        ElementPrototype.getAttrs = function() {
            return this.vnode.attrs;
        };

       /**
        * Gets an attribute of the Element.
        *
        * Same as getAttr().
        *
        * @method getAttribute
        * @param attributeName {String}
        * @return {String|null} value of the attribute
        * @since 0.0.1
        */
        ElementPrototype._getAttribute = ElementPrototype.getAttribute;
        ElementPrototype.getAttribute = function(attributeName) {
            return this.vnode.attrs[attributeName] || null;
        };

        /**
         * Returns a live collection of the Element-childNodes.
         *
         * @method getChildren
         * @return {ElementArray}
         * @since 0.0.1
         */
        ElementPrototype.getChildren = function() {
            var vChildren = this.vnode.vChildren,
                len = vChildren.length,
                children = ElementArray.createArray(),
                i;
            for (i=0; i<len; i++) {
                children[children.length] = vChildren[i].domNode;
            }
            return children;
        };

        /**
         * Returns a token list of the class attribute of the element.
         * See: https://developer.mozilla.org/en-US/docs/Web/API/DOMTokenList
         *
         * @method getClassList
         * @return DOMTokenList
         * @since 0.0.1
         */
        ElementPrototype.getClassList = function() {
            var instance = this,
                vnode = instance.vnode;
            if (!vnode._classList) {
                vnode._classList = Object.create(classListProto);
                vnode._classList._init(instance);
            }
            return vnode._classList;
        };

       /**
        * Returns data set specified by `key`. If not set, `undefined` will be returned.
        * The data is efficiently stored on the vnode.
        *
        * @method getData
        * @param key {string} name of the key
        * @return {Any|undefined} data set specified by `key`
        * @since 0.0.1
        */
        ElementPrototype.getData = function(key) {
            var vnode = this.vnode;
            return vnode._data && vnode._data[key];
        };

       /**
        * Gets one Element, specified by the css-selector. To retrieve a single element by id,
        * you need to prepend the id-name with a `#`. When multiple Element's match, the first is returned.
        *
        * @method getElement
        * @param cssSelector {String} css-selector to match
        * @return {Element|null} the Element that was search for
        * @since 0.0.1
        */
        ElementPrototype.getElement = function(cssSelector) {
            return ((cssSelector[0]==='#') && (cssSelector.indexOf(' ')===-1)) ? this.getElementById(cssSelector.substr(1)) : this.querySelector(cssSelector);
        };

        /**
         * Returns the Element matching the specified id, which should should be a descendant of this Element.
         *
         * @method getElementById
         * @param id {String} id of the Element
         * @return {Element|null}
         *
         */
        ElementPrototype.getElementById = function(id) {
            var element = nodeids[id];
            if (element && !this.contains(element)) {
                // outside itself
                return null;
            }
            return element || null;
        };

        /**
         * Gets innerHTML of the dom-node.
         * Goes through the vdom, so it's superfast.
         *
         * Use this method instead of `innerHTML`
         *
         * @method getHTML
         * @return {String}
         * @since 0.0.1
         */
        ElementPrototype.getHTML = function() {
            return this.vnode.innerHTML;
        };

       /**
        * Returns the Elments `id`
        *
        * @method getId
        * @return {String|undefined} Elements `id`
        * @since 0.0.1
        */
        ElementPrototype.getId = function() {
            return this.vnode.id;
        };

       /**
        * Returns inline style of the specified property. `Inline` means: what is set directly on the Element,
        * this doesn't mean necesairy how it is looked like: when no css is set inline, the Element might still have
        * an appearance because of other CSS-rules.
        *
        * In most cases, you would be interesting in using `getStyle()` instead.
        *
        * Note: no need to camelCase cssProperty: both `margin-left` as well as `marginLeft` are fine
        *
        * @method getInlineStyle
        * @param cssProperty {String} the css-property to look for
        * @param [pseudo] {String} to look inside a pseudo-style
        * @return {String|undefined} css-style
        * @since 0.0.1
        */
        ElementPrototype.getInlineStyle = function(cssProperty, pseudo) {
            var styles = this.vnode.styles,
                groupStyle = styles && styles[pseudo || 'element'];
            return groupStyle && groupStyle[fromCamelCase(cssProperty)];
        };

        /**
         * Gets the outerHTML of the dom-node.
         * Goes through the vdom, so it's superfast.
         *
         * Use this method instead of `outerHTML`
         *
         * @method getOuterHTML
         * @return {String}
         * @since 0.0.1
         */
        ElementPrototype.getOuterHTML = function() {
            return this.vnode.outerHTML;
        };

        /**
         * Returns the Element's parent Element.
         *
         * @method getParent
         * @return {Element}
         */
        ElementPrototype.getParent = function() {
            var vParent = this.vnode.vParent;
            return vParent && vParent.domNode;
        };

       /**
        * Returns cascaded style of the specified property. `Cascaded` means: the actual present style,
        * the way it is visible (calculated through the DOM-tree).
        *
        * Note1: values are absolute: percentages and points are converted to absolute values, sizes are in pixels, colors in rgb/rgba-format.
        * Note2: you cannot query shotcut-properties: use `margin-left` instead of `margin`.
        * Note3: no need to camelCase cssProperty: both `margin-left` as well as `marginLeft` are fine.
        *
        * @method getCascadeStyle
        * @param cssProperty {String} property that is queried
        * @param [pseudo] {String} to query pseudo-element, fe: `:before` or `:first-line`
        * @return {String} value for the css-property
        * @since 0.0.1
        */
        ElementPrototype.getStyle = function(cssProperty, pseudo) {
            return window.getComputedStyle(this, pseudo)[toCamelCase(cssProperty)];
        };

       /**
        * Elements tag-name in uppercase (same as nodeName).
        *
        * @method getTagName
        * @return {String}
        * @since 0.0.1
        */
        ElementPrototype.getTagName = function() {
            return this.vnode.tag;
        };

        /**
         * Gets the innerContent of the Element as plain text.
         * Goes through the vdom, so it's superfast.
         *
         * Use this method instead of `textContent`
         *
         * @method getText
         * @return String
         * @since 0.0.1
         */
        ElementPrototype.getText = function() {
            return this.vnode.textContent;
        };

       /**
        * Gets the value of the following vElements:
        *
        * <ul>
        *     <li>input</li>
        *     <li>textarea</li>
        *     <li>select</li>
        *     <li>any container that is `contenteditable`</li>
        * </ul>
        *
        * @method getValue
        * @return {String}
        * @since 0.0.1
        */
        ElementPrototype.getValue = function() {
            // cautious: input and textarea must be accessed by their propertyname:
            // input.getAttribute('value') would return the default-value instead of actual
            // and textarea.getAttribute('value') doesn't exist
            var instance = this,
                editable = ((editable=instance.vnode.attrs.contenteditable) && (editable!=='false'));
            return editable ? instance.getHTML() : instance.value;
        };

       /**
        * Whether the Element has the attribute set.
        *
        * Alias for hasAttribute().
        *
        * @method hasAttr
        * @param attributeName {String}
        * @return {Boolean} Whether the Element has the attribute set.
        * @since 0.0.1
        */
        ElementPrototype.hasAttr = function(attributeName) {
            return !!this.vnode.attrs[attributeName];
        };

       /**
        * Whether the Element has the attribute set.
        *
        * Same as hasAttr().
        *
        * @method hasAttribute
        * @param attributeName {String}
        * @return {Boolean} Whether the Element has the attribute set.
        * @since 0.0.1
        */
        ElementPrototype.hasAttribute = function(attributeName) {
            return !!this.vnode.attrs[attributeName];
        };

        /**
         * Indicating if the current element has any attributes or not.
         *
         * @method hasAttributes
         * @return {Boolean} Whether the current element has any attributes or not.
         */
        ElementPrototype.hasAttributes = function() {
            var attrs = this.vnode.attrs;
            return attrs ? (attrs.size() > 0) : false;
        };

       /**
        * Indicating if the Element has any children (childNodes with nodeType of 1).
        *
        * @method hasChildren
        * @return {Boolean} whether the Element has children
        * @since 0.0.1
        */
        ElementPrototype.hasChildren = function() {
            return this.vnode.hasVChildren();
        };

       /**
        * Checks whether the className is present on the Element.
        *
        * @method hasClass
        * @param className {String|Array} the className to check for. May be an Array of classNames, which all needs to be present.
        * @return {Boolean} whether the className (or classNames) is present on the Element
        * @since 0.0.1
        */
        ElementPrototype.hasClass = function(className) {
            return this.getClassList().contains(className);
        };

       /**
        * If the Element has data set specified by `key`. The data could be set with `setData()`.
        *
        * @method hasData
        * @param key {string} name of the key
        * @return {Boolean}
        * @since 0.0.1
        */
        ElementPrototype.hasData = function(key) {
            var vnode = this.vnode;
            return !!(vnode._data && vnode._data[key]);
        };

       /**
        * Indicates whether Element currently has the focus.
        *
        * @method hasFocus
        * @return {Boolean}
        * @since 0.0.1
        */
        ElementPrototype.hasFocus = function() {
            return (DOCUMENT.activeElement===this);
        };

       /**
         * Checks whether the Element lies within the specified selector (which can be a CSS-selector or a Element)
         *
         * @example
         * var divnode = childnode.inside('div.red');
         *
         * @example
         * var divnode = childnode.inside(containerNode);
         *
         * @method inside
         * @param selector {Element|String} the selector, specified by a Element or a css-selector
         * @return {Element|false} the nearest Element that matches the selector, or `false` when not found
         * @since 0.0.1
         */
        ElementPrototype.inside = function(selector) {
            var instance = this,
                vParent;
            if (typeof selector===STRING) {
                vParent = instance.vnode.vParent;
                while (vParent && !vParent.matchesSelector(selector)) {
                    vParent = vParent.vParent;
                }
                return vParent ? vParent.domNode : false;
            }
            else {
                // selector should be an Element
                return ((selector!==instance) && selector.contains(instance)) ? selector : false;
            }
        };

       /**
         * Checks whether a point specified with x,y is within the Element's region.
         *
         * @method insidePos
         * @param x {Number} x-value for new position (coordinates are page-based)
         * @param y {Number} y-value for new position (coordinates are page-based)
         * @return {Boolean} whether there is a match
         * @since 0.0.1
         */
        ElementPrototype.insidePos = function(x, y) {
            var instance = this,
                left = instance.left,
                top = instance.top,
                right = left + instance.offsetWidth,
                bottom = top + instance.offsetHeight;
            return (x>=left) && (x<=right) && (y>=top) && (y<=bottom);
        };

        /**
         * Inserts `domNode` before `refDomNode`.
         *
         * @method insertBefore
         * @param domNode {Node|Element|ElementArray|String} content to insert
         * @param refDomNode {Element} The Element before which newElement is inserted.
         * @param [escape] {Boolean} whether to insert `escaped` content, leading it into only text inserted
         * @return {Node} the Element being inserted (equals domNode)
         */
        ElementPrototype._insertBefore = ElementPrototype.insertBefore;
        ElementPrototype.insertBefore = function(domNode, refDomNode, escape) {
            return this.prepend(domNode, escape, refDomNode);
        };

        /**
         * Reference to the last of sibbling vNode's, where the related dom-node is an Element(nodeType===1).
         *
         * @method last
         * @param [cssSelector] {String} to return the last Element that matches the css-selector
         * @return {Element}
         * @since 0.0.1
         */
        ElementPrototype.last = function(cssSelector) {
            var vParent = this.vnode.vParent;
            return vParent && vParent.lastOfVChildren(cssSelector).domNode;
        };

        /**
         * Reference to the last child-Element, where the related dom-node an Element (nodeType===1).
         *
         * @method lastOfChildren
         * @param [cssSelector] {String} to return the last Element that matches the css-selector
         * @return {Element}
         * @since 0.0.1
         */
        ElementPrototype.lastOfChildren = function(cssSelector) {
            var foundVNode = this.vnode.lastOfVChildren(cssSelector);
            return foundVNode && foundVNode.domNode;
        };

        /**
         * Indicates if the element would be selected by the specified selector string.
         * Alias for matchesSelector()
         *
         * @method matches
         * @param [cssSelector] {String} the css-selector to check for
         * @return {Boolean}
         * @since 0.0.1
         */
        ElementPrototype.matches = function(selectors) {
            return this.vnode.matchesSelector(selectors);
        };

        /**
         * Indicates if the element would be selected by the specified selector string.
         * Alias for matches()
         *
         * @method matchesSelector
         * @param [cssSelector] {String} the css-selector to check for
         * @return {Boolean}
         * @since 0.0.1
         */
        ElementPrototype.matchesSelector = function(selectors) {
            return this.vnode.matchesSelector(selectors);
        };

        /**
         * Reference to the next of sibbling Element, where the related dom-node is an Element(nodeType===1).
         *
         * @method next
         * @param [cssSelector] {String} css-selector to be used as a filter
         * @return {Element|null}
         * @type Element
         * @since 0.0.1
         */
        ElementPrototype.next = function(cssSelector) {
            var vnode = this.vnode,
                found, vNextElement, firstCharacter, i, len;
            if (!cssSelector) {
                vNextElement = vnode.vNextElement;
                return vNextElement && vNextElement.domNode;
            }
            else {
                i = -1;
                len = cssSelector.length;
                while (!firstCharacter && (++i<len)) {
                    firstCharacter = cssSelector[i];
                    (firstCharacter===' ') && (firstCharacter=null);
                }
                if (firstCharacter==='>') {
                    return null;
                }
            }
            vNextElement = vnode;
            do {
                vNextElement = vNextElement.vNextElement;
                found = vNextElement && vNextElement.matchesSelector(cssSelector);
            } while(vNextElement && !found);
            return found ? vNextElement.domNode : null;
        };

       /**
        * Prepends a Element or text at the start of Element's innerHTML, or before the `refElement`.
        *
        * @method prepend
        * @param content {Element|Element|ElementArray|String} content to prepend
        * @param [escape] {Boolean} whether to insert `escaped` content, leading it into only text inserted
        * @param [refElement] {Element} reference Element where the content should be prepended
        * @return {Element} the created Element (or the last when multiple)
        * @since 0.0.1
        */
        ElementPrototype.prepend = function(content, escape, refElement) {
            var instance = this,
                vnode = instance.vnode,
                i, len, item, createdElement, vnodes, vChildNodes, vRefElement,
            doPrepend = function(oneItem) {
                escape && (oneItem=DOCUMENT.createTextNode(oneItem.getOuterHTML()));
                createdElement = refElement ? vnode._insertBefore(oneItem.vnode, refElement.vnode) : vnode._appendChild(oneItem.vnode);
                // CAUTIOUS: when using TextNodes, they might get merged (vnode._normalize does this), which leads into disappearance of refElement:
                refElement = createdElement;
            };
            vnode._noSync();
            if (!refElement) {
                vChildNodes = vnode.vChildNodes;
                vRefElement = vChildNodes && vChildNodes[0];
                refElement = vRefElement && vRefElement.domNode;
            }
            (typeof content===STRING) && (content=htmlToVFragments(content));
            if (Array.isArray(content)) {
                len = content.length;
                // to manage TextNodes which might get merged, we loop downwards:
                for (i=len-1; i>=0; i--) {
                    item = content[i];
                    doPrepend(item);
                }
            }
            else if (content.isFragment) {
                vnodes = content.vnodes;
                len = vnodes.length;
                // to manage TextNodes which might get merged, we loop downwards:
                for (i=len-1; i>=0; i--) {
                    doPrepend(vnodes[i].domNode);
                }
            }
            else {
                doPrepend(content);
            }
            return createdElement;
        };

        /**
         * Reference to the previous of sibbling Element, where the related dom-node is an Element(nodeType===1).
         *
         * @method previous
         * @param [cssSelector] {String} css-selector to be used as a filter
         * @return {Element|null}
         * @type Element
         * @since 0.0.1
         */
        ElementPrototype.previous = function(cssSelector) {
            var vnode = this.vnode,
                found, vPreviousElement, firstCharacter, i, len;
            if (!cssSelector) {
                vPreviousElement = vnode.vPreviousElement;
                return vPreviousElement && vPreviousElement.domNode;
            }
            else {
                i = -1;
                len = cssSelector.length;
                while (!firstCharacter && (++i<len)) {
                    firstCharacter = cssSelector[i];
                    (firstCharacter===' ') && (firstCharacter=null);
                }
                if (firstCharacter==='>') {
                    return null;
                }
            }
            vPreviousElement = vnode;
            do {
                vPreviousElement = vPreviousElement.vPreviousElement;
                found = vPreviousElement && vPreviousElement.matchesSelector(cssSelector);
            } while(vPreviousElement && !found);
            return found ? vPreviousElement.domNode : null;
        };

        /**
         * Returns the first Element within the Element, that matches the CSS-selectors. You can pass one, or multiple CSS-selectors. When passed multiple,
         * they need to be separated by a `comma`.
         *
         * @method querySelector
         * @param selectors {String} CSS-selector(s) that should match
         * @return {Element}
         */
        ElementPrototype.querySelector = function(selectors) {
            var found,
                i = -1,
                len = selectors.length,
                firstCharacter, startvnode,
                thisvnode = this.vnode,
                inspectChildren = function(vnode) {
                    var vChildren = vnode.vChildren,
                        len = vChildren ? vChildren.length : 0,
                        i, vChildNode;
                    for (i=0; (i<len) && !found; i++) {
                        vChildNode = vChildren[i];
                        vChildNode.matchesSelector(selectors, thisvnode) && (found=vChildNode.domNode);
                        found || inspectChildren(vChildNode);
                    }
                };
            while (!firstCharacter && (++i<len)) {
                firstCharacter = selectors[i];
                (firstCharacter===' ') && (firstCharacter=null);
            }
            startvnode = SIBLING_MATCH_CHARACTER[firstCharacter] ? thisvnode.vParent : thisvnode;
            startvnode && inspectChildren(startvnode);
            return found;
        };

        /**
         * Returns an ElementArray of all vElements within the Element, that match the CSS-selectors. You can pass one, or multiple CSS-selectors. When passed multiple,
         * they need to be separated by a `comma`.
         *
         * querySelectorAll is a snapshot of the dom at the time this method was called. It is not updated when changes of the dom are made afterwards.
         *
         * @method querySelectorAll
         * @param selectors {String} CSS-selector(s) that should match
         * @return {ElementArray} non-life Array (snapshot) with vElements
         */
        ElementPrototype.querySelectorAll = function(selectors) {
            var found = ElementArray.createArray(),
                i = -1,
                len = selectors.length,
                firstCharacter, startvnode,
                thisvnode = this.vnode,
                inspectChildren = function(vnode) {
                    var vChildren = vnode.vChildren,
                        len = vChildren ? vChildren.length : 0,
                        i, vChildNode;
                    for (i=0; i<len; i++) {
                        vChildNode = vChildren[i];
                        vChildNode.matchesSelector(selectors, thisvnode) && (found[found.length]=vChildNode.domNode);
                        inspectChildren(vChildNode);
                    }
                };
            while (!firstCharacter && (++i<len)) {
                firstCharacter = selectors[i];
                (firstCharacter===' ') && (firstCharacter=null);
            }
            startvnode = SIBLING_MATCH_CHARACTER[firstCharacter] ? thisvnode.vParent : thisvnode;
            startvnode && inspectChildren(startvnode);
            return found;
        };

       /**
         * Checks whether the Element has its rectangle inside the outbound-Element.
         * This is no check of the DOM-tree, but purely based upon coordinates.
         *
         * @method rectangleInside
         * @param outboundElement {Element} the Element where this element should lie inside
         * @return {Boolean} whether the Element lies inside the outboundElement
         * @since 0.0.1
         */
        ElementPrototype.rectangleInside = function(outboundElement) {
            var instance = this,
                outerRect = outboundElement.getBoundingClientRect(),
                innerRect = instance.getBoundingClientRect();
            return (outerRect.left<=innerRect.left) &&
                   (outerRect.top<=innerRect.top) &&
                   ((outerRect.left+outboundElement.offsetWidth)>=(innerRect.left+instance.offsetWidth)) &&
                   ((outerRect.top+outboundElement.offsetHeight)>=(innerRect.top+instance.offsetHeight));
        };

       /**
        * Removes the Element from the DOM.
        * Alias for thisNode.parentNode.removeChild(thisNode);
        *
        * @method remove
        * @since 0.0.1
        */
        ElementPrototype.remove = function() {
            var vnode = this.vnode;
            vnode.vParent._removeChild(vnode);
        };

       /**
        * Removes the attribute from the Element.
        *
        * Alias for removeAttribute() BUT is chainable instead (removeAttribute is not).
        *
        * @method removeAttr
        * @param attributeName {String}
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.removeAttr = function(/* attributeName */) {
            this.removeAttribute.apply(this, arguments);
            return this;
        };

       /**
        * Removes the attribute from the Element.
        *
        * Use removeAttr() to be able to chain.
        *
        * @method removeAttr
        * @param attributeName {String}
        * @since 0.0.1
        */
        ElementPrototype._removeAttribute = ElementPrototype.removeAttribute;
        ElementPrototype.removeAttribute = function(attributeName) {
            this.vnode._removeAttr(attributeName);
        };

        /**
        * Removes the Element's child-Node from the DOM.
        *
        * @method removeChild
        * @param domNode {Node} the child-Node to remove
        */
        ElementPrototype._removeChild = ElementPrototype.removeChild;
        ElementPrototype.removeChild = function(domNode) {
            this.vnode._removeChild(domNode.vnode);
        };

       /**
        * Removes a className from the Element.
        *
        * @method removeClass
        * @param className {String|Array} the className that should be removed. May be an Array of classNames.
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.removeClass = function(className) {
            var instance = this;
            instance.getClassList().remove(className);
            return instance;
        };

       /**
        * Removes data specified by `key` that was set by using `setData()`.
        * When no arguments are passed, all node-data (key-value pairs) will be removed.
        *
        * @method removeData
        * @param key {string} name of the key
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.removeData = function(key) {
            var vnode = this.vnode;
            if (vnode._data) {
                if (key) {
                    delete vnode._data[key];
                }
                else {
                    // we cannot just redefine _data, for it is set as readonly
                    vnode._data.each(
                        function(value, key) {
                            delete vnode._data[key];
                        }
                    );
                }
            }
            return this;
        };

       /**
        * Removes a css-property (inline) out of the Element.
        * No need to use camelCase.
        *
        * @method removeInlineStyle
        * @param cssProperty {String} the css-property to remove
        * @param [pseudo] {String} to look inside a pseudo-style
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.removeInlineStyle = function(cssProperty, pseudo) {
            var instance = this,
                vnode = instance.vnode,
                styles = vnode.styles[pseudo || 'element'],
                prop;
            if (styles) {
                prop = fromCamelCase(cssProperty);
                if (styles[prop]) {
                    delete styles[prop];
                    (styles.size()===0) && (delete vnode.styles[pseudo || 'element']);
                    instance.setAttr('style', vnode.serializeStyles());
                }
            }
            return instance;
        };

       /**
        * Replaces the Element with a new Element.
        *
        * @method replace
        * @param content {Element|Element|ElementArray|String} content to replace
        * @param [escape] {Boolean} whether to insert `escaped` content, leading it into only text inserted
        * @return {Element} the created Element (or the last when multiple)
        * @since 0.0.1
        */
        ElementPrototype.replace = function(newElement, escape) {
            var instance = this,
                vnode = instance.vnode,
                previousVNode = vnode.vPrevious,
                vParent = vnode.vParent,
                createdElement;
            createdElement = previousVNode ? vParent.domNode.append(newElement, escape, previousVNode.domNode) : vParent.domNode.prepend(newElement, escape);
            instance.setClass(HIDDEN);
            instance.remove();
            return createdElement;
        };

        /**
        * Replaces the Element's child-Element with a new Element.
        *
        * @method replaceChild
        * @param newElement {Element} the new Element
        * @param oldVChild {Element} the Element to be replaced
        * @param [escape] {Boolean} whether to insert `escaped` content, leading it into only text inserted
        * @return {Element} the Element that was removed (equals oldVChild)
        * @since 0.0.1
        */
        ElementPrototype._replaceChild = ElementPrototype.replaceChild;
        ElementPrototype.replaceChild = function(newDomNode, oldDomNode, escape) {
            return oldDomNode.replace(newDomNode, escape);
        };

       /**
        * Replaces the className of the Element with a new className.
        * If the previous className is not available, the new className is set nevertheless.
        *
        * @method replaceClass
        * @param prevClassName {String} the className to be replaced
        * @param newClassName {String} the className to be set
        * @param [force ] {Boolean} whether the new className should be set, even is the previous className isn't there
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.replaceClass = function(prevClassName, newClassName, force) {
            var instance = this;
            if (force || instance.hasClass(prevClassName)) {
                instance.removeClass(prevClassName).setClass(newClassName);
            }
            return instance;
        };

        /**
         * Scrolls the content of the Element into the specified scrollposition.
         * Only available when the Element has overflow.
         *
         * @method scrollTo
         * @param x {Number} left-offset in pixels
         * @param y {Number} top-offset in pixels
         * @chainable
         * @since 0.0.1
        */
        ElementPrototype.scrollTo = function(x, y) {
            var instance = this;
            instance.scrollLeft = x;
            instance.scrollTop = y;
            return instance;
        };

       /**
         * Sets the attribute on the Element with the specified value.
         *
         * Alias for setAttribute(), BUT differs in a way that setAttr is chainable, setAttribute is not.
         *
         * @method setAttr
         * @param attributeName {String}
         * @param value {Any} the value that belongs to `key`
         * @chainable
         * @since 0.0.1
        */
        ElementPrototype.setAttr = function(/* attributeName, value */) {
            var instance = this;
            instance.setAttribute.apply(instance, arguments);
            return instance;
        };

       /**
         * Sets the attribute on the Element with the specified value.
         *
         * Alias for setAttr(), BUT differs in a way that setAttr is chainable, setAttribute is not.
         *
         * @method setAttribute
         * @param attributeName {String}
         * @param value {String} the value for the attributeName
        */
        ElementPrototype._setAttribute = ElementPrototype.setAttribute;
        ElementPrototype.setAttribute = function(attributeName, value) {
            var instance = this,
                vnode = instance.vnode;
            (value==='') && (value=null);
            value ? vnode._setAttr(attributeName, value) : vnode._removeAttr(attributeName);
        };

       /**
        * Adds a class to the Element. If the class already exists it won't be duplicated.
        *
        * @method setClass
        * @param className {String|Array} className to be added, may be an array of classNames
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.setClass = function(className) {
            var instance = this;
            instance.getClassList().add(className);
            return instance;
        };

        /**
         * Stores arbitary `data` at the Element (actually at vnode). This has nothing to do with node-attributes whatsoever,
         * it is just a way to bind any data to the specific Element so it can be retrieved later on with `getData()`.
         *
         * @method setData
         * @param key {string} name of the key
         * @param value {Any} the value that belongs to `key`
         * @chainable
         * @since 0.0.1
        */
        ElementPrototype.setData = function(key, value) {
            var vnode = this.vnode;
            vnode._data ||  Object.defineProperty(vnode, '_data', {
                configurable: false,
                enumerable: false,
                writable: false,
                value: {} // `writable` is false means we cannot chance the value-reference, but we can change {}'s properties itself
            });
            vnode._data[key] = value;
            return this;
        };

        /**
         * Sets the innerHTML of both the vnode as well as the representing dom-node.
         * Goes through the vdom, so it's superfast.
         *
         * Use this method instead of `innerHTML`
         *
         * Syncs with the DOM.
         *
         * @method setHTML
         * @param val {String} the new value to be set
         * @chainable
         * @since 0.0.1
         */
        ElementPrototype.setHTML = function(val) {
            this.vnode.innerHTML = val;
            return this;
        };

       /**
        * Sets the Elments `id`
        *
        * @method setId
        * @param val {String} Elements new `id`
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.setId = function(val) {
            return this.setAttr('id', val);
        };

       /**
        * Sets a css-property (inline) for the Element.
        *
        * Note: no need to camelCase cssProperty: both `margin-left` as well as `marginLeft` are fine
        *
        * @method setStyle
        * @param cssProperty {String} the css-property to be set
        * @param value {String} the css-value
        * @param [pseudo] {String} to look inside a pseudo-style
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.setInlineStyle = function(cssProperty, value, pseudo) {
            var instance = this,
                vnode = instance.vnode,
                styles, group;
            value || (value='');
            cssProperty = fromCamelCase(cssProperty);
            if (value==='') {
                return instance.removeInlineStyle(cssProperty, pseudo);
            }
            vnode.styles || (vnode.styles={});
            group = pseudo || 'element';
            vnode.styles[group] || (vnode.styles[group]={});
            styles = vnode.styles[group];
            styles[cssProperty] = value;
            instance.setAttr('style', vnode.serializeStyles());
            return instance;
        };

        /**
         * Gets or sets the outerHTML of both the Element as well as the representing dom-node.
         * Goes through the vdom, so it's superfast.
         *
         * Use this property instead of `outerHTML`
         *
         * Syncs with the DOM.
         *
         * @method setOuterHTML
         * @param val {String} the new value to be set
         * @chainable
         * @since 0.0.1
         */
        ElementPrototype.setOuterHTML = function(val) {
            this.vnode.outerHTML = val;
            return this;
        };

        /**
         * Sets the innerContent of the Element as plain text.
         * Goes through the vdom, so it's superfast.
         *
         * Use this method instead of `textContent`
         *
         * Syncs with the DOM.
         *
         * @method setText
         * @param val {String} the textContent to be set
         * @chainable
         * @since 0.0.1
         */
        ElementPrototype.setText = function(val) {
            this.vnode.textContent = val;
            return this;
        };

       /**
        * Sets the value of the following vElements:
        *
        * <ul>
        *     <li>input</li>
        *     <li>textarea</li>
        *     <li>select</li>
        *     <li>any container that is `contenteditable`</li>
        * </ul>
        *
        * Will emit a `valuechange`-event when a new value is set and ITSA's `event`-module is active.
        *
        * @method setValue
        * @param val {String} thenew value to be set
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.setValue = function(val) {
            var instance = this,
                prevVal = instance.value,
            // cautious: input and textarea must be accessed by their propertyname:
            // input.getAttribute('value') would return the defualt-value instead of actusl
            // and textarea.getAttribute('value') doesn't exist
                editable = ((editable=instance.vnode.attrs.contenteditable) && (editable!=='false')),
                tag, i, option, len, vChildren;
            if (editable) {
                instance.setHTML(val);
            }
            else {
                tag = instance.getTagName();
                if ((tag==='INPUT') || (tag==='TEXTAREA')) {
                    instance.value = val;
                }
                else if (tag==='SELECT') {
                    vChildren = instance.vnode.vChildren;
                    len = vChildren.length;
                    for (i=0; i<len; i++) {
                        option = vChildren[i];
                        if (option.attrs.value === val) {
                            instance.selectedIndex = i;
                            break;
                        }
                    }
                }
            }
            // if `document._emitVC` is available, then invoke it to emit the `valuechange`-event
            /**
            * @event valuechange
            * @param e.value {String} new value
            * @param e.sourceTarget {Element} Element whare the valuechange occured
            */
            DOCUMENT._emitVC && (prevVal!==val) && DOCUMENT._emitVC(instance, val);
            return instance;
        };

       /**
         * Set the position of an html element in page coordinates.
         * The element must be part of the DOM tree to have page coordinates (display:none or elements not appended return false).
         *
         * If the Element has the attribute `xy-constrian` set, then its position cannot exceed any matching container it lies within.
         *
         * @method setXY
         * @param x {Number} x-value for new position (coordinates are page-based)
         * @param y {Number} y-value for new position (coordinates are page-based)
         * @param [constrain] {'window', Element, Object, String}
         * <ul>
         *     <li><b>'window'</b> to constrain to the visible window</li>
         *     <li><b>Element</b> to constrain to a specified Element</li>
         *     <li><b>Object</b> to constrain to an object with the properties: {x, y, w, h} where x and y are absolute pixels of the document
         *            (like calculated with getX() and getY()).</li>
         *     <li><b>String</b> to constrain to a specified css-selector, which should be an ancestor</li>
         * </ul>
         * @param [notransition=false] {Boolean} set true if you are sure positioning is without transition.
         *        this isn't required, but it speeds up positioning. Only use when no transition is used:
         *        when there is a transition, setting this argument `true` would miscalculate the position.
         * @chainable
         * @since 0.0.1
         */
        ElementPrototype.setXY = function(x, y, constrain, notransition) {
            console.log(NAME, 'setXY '+x+','+y);
            var instance = this,
                position = instance.getStyle(POSITION),
                dif, match, constrainNode, byExactId, parent, clone,
                containerTop, containerRight, containerLeft, containerBottom, requestedX, requestedY;

            // default position to relative
            if (position==='static') {
                instance.setInlineStyle(POSITION, 'relative');
            }
            // make sure it has sizes and can be positioned
            instance.setClass(INVISIBLE).setClass(BORDERBOX);
            (instance.getInlineStyle('display')==='none') && instance.setClass(BLOCK);
            if (constrain) {
                if (constrain==='window') {
                    containerLeft = window.getScrollLeft();
                    containerTop = window.getScrollTop();
                    containerRight = containerLeft + window.getWidth();
                    containerBottom = containerTop + window.getHeight();
                }
                else {
                    if (typeof constrain === STRING) {
                        match = false;
                        constrainNode = instance.getParent();
                        byExactId = REGEXP_NODE_ID.test(constrain);
                        while (constrainNode.matchesSelector && !match) {
                            match = byExactId ? (constrainNode.id===constrain.substr(1)) : constrainNode.matchesSelector(constrain);
                            // if there is a match, then make sure x and y fall within the region
                            match || (constrainNode=constrainNode.getParent());
                        }
                        // if Element found, then bound it to `constrain` as if the argument `constrain` was an Element
                        match && (constrain=constrainNode);
                    }
                    if (constrain.matchesSelector) {
                        // Element --> we need to search the rectangle
                        containerLeft = constrain.left + parseInt(constrain.getStyle(BORDER_LEFT_WIDTH), 10);
                        containerTop = constrain.top + parseInt(constrain.getStyle(BORDER_TOP_WIDTH), 10);
                        containerRight = containerLeft + constrain.scrollWidth;
                        containerBottom = containerTop + constrain.scrollHeight;
                    }
                    else {
                        containerLeft = constrain.x;
                        containerTop = constrain.y;
                        containerRight = constrain.x + constrain.w;
                        containerBottom = constrain.y + constrain.h;
                    }
                }
                if (typeof containerLeft === NUMBER) {
                    // found constrain, always redefine x and y
                    x = requestedX = (typeof x===NUMBER) ? x : instance.left;
                    if (requestedX<containerLeft) {
                        x = containerLeft;
                    }
                    else {
                        if ((requestedX+instance.offsetWidth)>containerRight) {
                            x = requestedX = containerRight - instance.offsetWidth;
                        }
                        // now we might need to reset to the left again:
                        (requestedX<containerLeft) && (x=containerLeft);
                    }
                    y = requestedY = (typeof y===NUMBER) ? y : instance.top;
                    if (requestedY<containerTop) {
                        y = containerTop;
                    }
                    else {
                        if ((requestedY+instance.offsetHeight)>containerBottom) {
                            y = requestedY = containerBottom - instance.offsetHeight;
                        }
                        // now we might need to reset to the top again:
                        (requestedY<containerTop) && (y=containerTop);
                    }
                }
            }
            if (typeof x === NUMBER) {
                // check if there is a transition:
                if (notransition) {
                    instance.setClass(INVISIBLE);
                    instance.setInlineStyle(LEFT, x + PX);
                    dif = (instance.left-x);
                    (dif!==0) && (instance.setInlineStyle(LEFT, (x - dif) + PX));
                    instance.removeClass(INVISIBLE);
                }
                else {
                    // we will clone the node, make it invisible and without transitions and look what its correction should be
                    clone = instance.cloneNode();
                    clone.setClass(NO_TRANS).setClass(INVISIBLE);
                    parent = instance.parentNode || DOCUMENT.body;
                    parent._appendChild(clone);
                    clone.setInlineStyle(LEFT, x+PX);
                    dif = (clone.left-x);
                    parent._removeChild(clone);
                    instance.setInlineStyle(LEFT, (x - dif) + PX);
                }
            }
            if (typeof y === NUMBER) {
                if (notransition) {
                    instance.setClass(INVISIBLE);
                    instance.setInlineStyle(TOP, y + PX);
                    dif = (instance.top-y);
                    (dif!==0) && (instance.setInlineStyle(TOP, (y - dif) + PX));
                    instance.removeClass(INVISIBLE);
                }
                else {
                    // we will clone the node, make it invisible and without transitions and look what its correction should be
                    clone = instance.cloneNode();
                    clone.setClass(NO_TRANS).setClass(INVISIBLE);
                    parent = instance.parentNode || DOCUMENT.body;
                    parent._appendChild(clone);
                    clone.setInlineStyle(TOP, y+PX);
                    dif = (clone.top-y);
                    parent._removeChild(clone);
                    instance.setInlineStyle(TOP, (y - dif) + PX);
                }
            }
            return instance.removeClass(BLOCK).removeClass(BORDERBOX).removeClass(INVISIBLE);
        };

       /**
        * Toggles the className of the Element.
        *
        * @method toggleClass
        * @param className {String|Array} className that should be toggled, may be an array of classNames
        * @param forceState {Boolean} to force toggling into this specific state
        * @chainable
        * @since 0.0.1
        */
        ElementPrototype.toggleClass = function(className, forceState) {
            var instance = this;
            instance.getClassList().toggle(className, forceState);
            return instance;
        };

        Object.defineProperties(ElementPrototype, {

           /**
            * Gets or set the height of the element in pixels. Included are padding and border, not any margins.
            * By setting the argument `overflow` you get the total height, included the invisible overflow.
            *
            * The getter is calculating through `offsetHeight`, the setter will set inline css-style for the height.
            *
            * Values are numbers without unity.
            *
            * @property height
            * @type {Number}
            * @since 0.0.1
            */
            height: {
                get: function() {
                    return this.offsetHeight;
                },
                set: function(val) {
                    var instance = this,
                        dif;
                    instance.setClass(INVISIBLE);
                    instance.setInlineStyle(HEIGHT, val + PX);
                    dif = (instance.offsetHeight-val);
                    (dif!==0) && (instance.setInlineStyle(HEIGHT, (val - dif) + PX));
                    instance.removeClass(INVISIBLE);
                }
            },

           /**
            * Gets the x-position (in the DOCUMENT) of the element in pixels.
            * DOCUMENT-related: regardless of the window's scroll-position.
            *
            * @property left
            * @since 0.0.1
            */
            left: {
                get: function() {
                    return Math.round(this.getBoundingClientRect().left + window.getScrollLeft());
                },
                set: function(pixelsLeft) {
                    return this.setXY(pixelsLeft, null, null, true);
                }
            },

           /**
            * Gets the y-position (in the DOCUMENT) of the element in pixels.
            * DOCUMENT-related: regardless of the window's scroll-position.
            *
            * @property top
            * @since 0.0.1
            */
            top: {
                get: function() {
                    return Math.round(this.getBoundingClientRect().top + window.getScrollTop());
                },
                set: function(pixelsTop) {
                    return this.setXY(null, pixelsTop, null, true);
                }
            },

           /**
            * Gets or set the width of the element in pixels. Included are padding and border, not any margins.
            * By setting the argument `overflow` you get the total width, included the invisible overflow.
            *
            * The getter is calculating through `offsetHeight`, the setter will set inline css-style for the width.
            *
            * Values are numbers without unity.
            *
            * @property width
            * @type {Number}
            * @since 0.0.1
            */
            width: {
                get: function() {
                    return this.offsetWidth;
                },
                set: function(val) {
                    var instance = this,
                        dif;
                    instance.setClass(INVISIBLE);
                    instance.setInlineStyle(WIDTH, val + PX);
                    dif = (instance.offsetWidth-val);
                    (dif!==0) && (instance.setInlineStyle(WIDTH, (val - dif) + PX));
                    instance.removeClass(INVISIBLE);
                }
            }

        });

    }(window.Element.prototype));

    setupObserver = function() {
        // configuration of the observer:
        var observerConfig = {
                attributes: true,
                subtree: true,
                characterData: true,
                childList : true
            };
        (new window.MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {

                var node = mutation.target,
                    vnode = node.vnode,
                    type = mutation.type,
                    attribute = mutation.attributeName,
                    addedChildNodes = mutation.addedNodes,
                    removedChildNodes = mutation.removedNodes,
                    i, len, childDomNode, childVNode, index, vchildnode;
                if (vnode && !vnode._nosync) {
                    if (type==='attributes') {
                        vnode.reloadAttr(attribute);
                    }
                    else if (type==='characterData') {
                        vnode.text = node.nodeValue;
                    }
                    else {
                        // remove the childNodes that are no longer there:
                        len = removedChildNodes.length;
                        for (i=len-1; i>=0; i--) {
                            childVNode = removedChildNodes[i].vnode;
                            childVNode && childVNode._destroy();
                        }
                       // add the new childNodes:
                        len = addedChildNodes.length;
                        for (i=0; i<len; i++) {
                            childDomNode = addedChildNodes[i];
                            // find its index in the true DOM:
                            index = node.childNodes.indexOf(childDomNode);
                            // create the vnode:
                            vchildnode = domNodeToVNode(childDomNode);
//======================================================================================================
// TODO: remove this block of code: we shouldn;t be needing it
// that is: when the alert never rises (which I expect it doesn't)


// prevent double definitions (for whatever reason):
// check if there is a vChild with the same domNode and remove it:
var vChildNodes = vnode.vChildNodes;
var len2 = vChildNodes.length;
var j;
for (j=0; j<len2; j++) {
    var checkChildVNode = vChildNodes[j];
    if (checkChildVNode.domNode===node) {
        checkChildVNode._destroy();
        alert('double deleted');
        break;
    }
}
// END OF removable block
//======================================================================================================
                            // add the vnode:
                            vchildnode._moveToParent(vnode, index);
                        }
                    }
                }
            });
        })).observe(DOCUMENT, observerConfig);
    };

    setupObserver();

};

//--- definition API of unmodified `Element`-methods ------

/**
 * Returns the specified attribute of the specified element, as an Attr node.
 *
 * @method getAttributeNode
 * @return {attributeNode}
 */

/**
 * Returns a text rectangle object that encloses a group of text rectangles. The returned value is
 * a TextRectangle object which is the union of the rectangles returned by getClientRects() for the element,
 * i.e., the CSS border-boxes associated with the element.
 *
 * The returned value is a TextRectangle object, which contains read-only left, top, right and bottom properties
 * describing the border-box in pixels. top and left are relative to the top-left of the viewport.
 *
 * @method getBoundingClientRect
 * @return {attributeNode} Therectangle object that encloses a group of text rectangles.
 */

/**
 * Returns a collection of rectangles that indicate the bounding rectangles for each box in a client.
 *
 * The returned value is a collection of ClientRect objects, one for each CSS border box associated with the element.
 * Each ClientRect object contains read-only left, top, right and bottom properties describing the border box, in pixels,
 * with the top-left relative to the top-left of the viewport. For tables with captions,
 * the caption is included even though it's outside the border box of the table.
 *
 * @method getClientRects
 * @return {Collection}
 */

/**
 * Returns a new NodeIterator object with this Element as root.
 *
 * The NodeIterator is a snapshot of the dom at the time this method was called. It is not updated when changes of the dom are made afterwards.
 *
 * @method createNodeIterator
 * @param [whatToShow] {Number} Filter specification constants from the NodeFilter DOM interface, indicating which nodes to iterate over.
 * You can use or sum one of the next properties:
 * <ul>
 *   <li>window.NodeFilter.SHOW_ELEMENT</li>
 *   <li>window.NodeFilter.SHOW_COMMENT</li>
 *   <li>window.NodeFilter.SHOW_TEXT</li>
 * </ul>
 * @param [filter] {NodeFilter|function} An object implementing the NodeFilter interface or a function. See https://developer.mozilla.org/en-US/docs/Web/API/NodeFilter
 * @return {NodeIterator}
 * @since 0.0.1
*/

/**
 * Returns an HTMLCollection of all vElements within this Element, that match their classes with the supplied `classNames` argument.
 * To match multiple different classes, separate them with a `comma`.
 *
 * getElementsByClassName is life presentation of the dom. The returned HTMLCollection gets updated when the dom changes.
 *
 * NOTE: it is highly recomended to use `document.getAll` because that method takes advantage of the vdom.
 *
 * @method getElementsByClassName
 * @param classNames {String} the classes to search for
 * @return {HTMLCollection} life Array with vElements
 */

/**
 * Returns an HTMLCollection of all vElements within this Element, that match their `name`-attribute with the supplied `name` argument.
 *
 * getElementsByName is life presentation of the dom. The returned HTMLCollection gets updated when the dom changes.
 *
 * NOTE: it is highly recomended to use `document.getAll` because that method takes advantage of the vdom.
 *
 * @method getElementsByName
 * @param name {String} the property of name-attribute to search for
 * @return {HTMLCollection} life Array with vElements
 */


/**
 * Returns an HTMLCollection of all vElements within this Element, that match their `name`-attribute with the supplied `name` argument.
 *
 * getElementsByTagName is life presentation of the dom. The returned HTMLCollection gets updated when the dom changes.
 *
 * NOTE: it is highly recomended to use `document.getAll` because that method takes advantage of the vdom.
 *
 * @method getElementsByTagName
 * @param tagNames {String} the tags to search for
 * @return {HTMLCollection} life Array with vElements
 */

/**
* Inserts the Element into the DOM tree at a specified position.
*
* @method insertAdjacentElement
* @param position {String}
* <ul>
*     <li>'beforebegin' Before the element itself</li>
*     <li>'afterbegin' Just inside the element, before its first child</li>
*     <li>'beforeend' Just inside the element, after its last child</li>
*     <li>'afterend' After the element itself</li>
* <ul>
* @param element {Element}
*/

/**
* Parses the specified text as HTML and inserts the resulting nodes into the DOM tree at a specified position.
*
* @method insertAdjacentHTML
* @param position {String}
* <ul>
*     <li>'beforebegin' Before the element itself</li>
*     <li>'afterbegin' Just inside the element, before its first child</li>
*     <li>'beforeend' Just inside the element, after its last child</li>
*     <li>'afterend' After the element itself</li>
* <ul>
* @param element {Element}
*/

/**
* Inserts the text into the DOM tree as a TextNode at a specified position.
*
* @method insertAdjacentText
* @param position {String}
* <ul>
*     <li>'beforebegin' Before the element itself</li>
*     <li>'afterbegin' Just inside the element, before its first child</li>
*     <li>'beforeend' Just inside the element, after its last child</li>
*     <li>'afterend' After the element itself</li>
* <ul>
* @param element {Element}
*/

/**
 * Inserts `newElement` before `referenceElement`.
 *
 * @method insertBefore
 * @param newElement {Element} The newElement to insert
 * @param referenceElement {Element} The Element before which newElement is inserted.
 * @return {Element} the Element being inserted (equals newElement)
 */

/**
* Removes the attribute specified by an attributeNode from the Element.
*
* @method removeAttributeNode
* @param attributeNode {attributeNode}
* @since 0.0.1
*/

/**
 * Scrolls the element into view.
 *
 * @method scrollIntoView
 */

/**
 * Sets the attribute on the Element specified by `attributeNode`
 *
 * @method setAttributeNode
 * @param attributeNode {attributeNode}
*/

//------ events --------

/**
 * Fired when a static `script` element  finishes executing its script. Does not fire if the element is added dynamically, eg with appendChild().
 *
 * @event afterscriptexecute
 */


/**
 * Fired when the code in a `script` element declared in an HTML document is about to start executing. Does not fire if the element is added dynamically, eg with appendChild().
 *
 * @event beforescriptexecute
 */

//------- properties --------

/**
 * sets or returns an accesskey for an element. An accesskey specifies a shortcut key to activate/focus an element.
 * Note: The way of accessing the shortcut key is varying in different browsers: http://www.w3schools.com/jsref/prop_html_accesskey.asp
 *
 * @property accessKey
 * @type String
 */


/**
 * Returns a live collection of all attribute nodes registered to the specified node.
 * It is a NamedNodeMap, not an Array, so it has no Array methods and the Attr nodes' indexes may differ among browsers.
 * To be more specific, attributes is a key/value pair of strings that represents any information regarding that attribute.
 *
 * Prefer to use `getAttrs()` which is much quicker, but doesn't return a life-list.
 *
 * @property attributes
 * @type NamedNodeMap
 */

/**
 * The absolute base URL of a node.
 *
 * @property baseURI
 * @type String
 * @readOnly
 */

/**
 * Returns the number of children (child vElements)
 *
 * @property childElementCount
 * @type Number
 * @readOnly
 */

/**
 * Returns a live collection of childNodes of the given element, either Element, TextNode or CommentNode
 *
 * @property childNodes
 * @type NodeList
 * @readOnly
 */

/**
 * Returns a live collection of child Element's of the given element.
 *
 * @property children
 * @type NodeList
 * @readOnly
 */

/**
 * Gets and sets the value of the class attribute of the specified element.
 *
 * @property className
 * @type String
 */

/**
 * Returns the inner height of an element in pixels, including padding but not the horizontal scrollbar height, border, or margin.
 *
 * @property clientHeight
 * @type Number
 * @readOnly
 */

/**
 * The width of the left border of an element in pixels. It includes the width of the vertical scrollbar if the text direction of the element is right–to–left
 * and if there is an overflow causing a left vertical scrollbar to be rendered. clientLeft does not include the left margin or the left padding.
 *
 * @property clientLeft
 * @type Number
 * @readOnly
 */

/**
 * The width of the top border of an element in pixels. It does not include the top margin or padding.
 *
 * @property clientTop
 * @type Number
 * @readOnly
 */

/**
 * Returns the inner width of an element in pixels, including padding but not the vertical scrollbar height, border, or margin.
 *
 * @property clientWidth
 * @type Number
 * @readOnly
 */

/**
 * Reference to the first childNode, where the related dom-node is either an Element, TextNode or CommentNode (nodeType===1, 3 or 8).
 *
 * Better work with Elements only:  use `firstElementChild` instead, which returns the first Element-child.
 *
 * @property firstChild
 * @type Node
 * @readOnly
 * @deprecated
 */

/**
 * Reference to the first Element-child, which is an Element (nodeType===1).
 *
 * @property firstElementChild
 * @type Element
 * @readOnly
 */

/**
 * Gets or sets the element's attribute `href`. Only applies for the `a`-element.
 *
 * @property href
 * @type String
 */

/**
 * Gets or sets the element's identifier (attribute id).
 *
 * @property id
 * @type String
 */

/**
 * Reference to the last childNode, where the related dom-node is either an Element, TextNode or CommentNode (nodeType===1, 3 or 8).
 *
 * Better use `lastElementChild` instead, which returns the last Element-child.
 *
 * @property lastChild
 * @type Node
 * @readOnly
 * @deprecated
 */

/**
 * Reference to the last Element-child, where the related dom-node is an Element (nodeType===1).
 *
 * @property lastElementChild
 * @type Element
 * @readOnly
 */

/**
 * Gets or sets the `name` property of a Element; it only applies to the following elements:
 * `a`, `applet`, `button`, `form`, `frame`, `iframe`, `img`, `input`, `map`, `meta`, `object`, `param`, `select`, and `textarea`.
 *
 * @property name
 * @type String
 */

/**
 * Returns the Element immediately following the specified one in its parent's childNodes list, or null if the specified node is the last node in that list.
 * Is an Element (nodeType===1).
 *
 * @property nextElementSibling
 * @type Element
 * @readOnly
 */

/**
 * Returns the Element immediately following the specified one in its parent's childNodes list, or null if the specified node is the last node in that list.
 * Is either an Element, TextNode or CommentNode (nodeType===1, 3 or 8).
 *
 * Do not use this, but use `lastElementChild` instead, which returns the next Element-child.
 *
 * @property nextElementSibling
 * @type Node
 * @deprecated
 * @readOnly
 */

/**
 * Elements tag-name
 *
 * @property nodeName
 * @type String
 * @readOnly
 */

/**
 * Elements nodetype: 1==Element, 3==TextNode, 8===CommentNode
 *
 * @property nodeType
 * @type String
 * @readOnly
 */

/**
 * Value/text for non-Element Nodes
 *
 * @property nodeValue
 * @type String
 * @since 0.0.1
 */

/**
 * The exact width of the Element on the screen.
 * Included borders and padding (no margin).
 *
 * Returns a number without unity.
 *
 * Better use `width` --> it's an alias, but has a setter as well
 *
 * @property offsetWidth
 * @type Number
 * @readOnly
 * @since 0.0.1
 */

/**
 * The exact height of the Element on the screen.
 * Included borders and padding (no margin).
 *
 * Returns a number without unity.
 *
 * Better use `height` --> it's an alias, but has a setter as well
 *
 * @property offsetHeight
 * @type Number
 * @since 0.0.1
 */

/**
 * Returns the Element's parent Element.
 *
 * Same as `parentNode`
 *
 * @property parentElement
 * @type Element
 */

/**
 * Returns the Element's parent Element.
 *
 * Same as `parentElement`
 *
 * @property parentNode
 * @type Element
 */

/**
 * Returns the Element immediately preceding the specified one in its parent's childNodes list, or null if the specified node is the last node in that list.
 * Is an Element (nodeType===1).
 *
 * @property previousElementSibling
 * @type Element
 * @readOnly
 */

/**
 * Returns the Element immediately preceding the specified one in its parent's childNodes list, or null if the specified node is the last node in that list.
 * Is either an Element, TextNode or CommentNode (nodeType===1, 3 or 8).
 *
 * Do not use this, but use `previousElementSibling` instead, which returns the previous Element-child.
 *
 * @property previousSibling
 * @deprecated
 * @type Node
 * @readOnly
 */


/**
 * A measurement of the height of an element's content, including content not visible on the screen due to overflow.
 * The scrollHeight value is equal to the minimum clientHeight the element would require in order to fit all the content in the viewpoint
 * without using a vertical scrollbar. It includes the element padding but not its margin.
 *
 * Returns a number without unity.
 *
 * @property scrollHeight
 * @type Number
 * @readOnly
 */

/**
 * Gets or sets the number of pixels that an element's content is scrolled to the left.
 *
 * @property scrollLeft
 * @type Number
 */

/**
 * Gets or sets the number of pixels that the content of an element is scrolled upward. An element's scrollTop is a measurement
 * of the distance of an element's top to its topmost visible content. When an element content does not generate a vertical scrollbar,
 * then its scrollTop value defaults to 0.
 *
 * @property scrollTop
 * @type Number
 */

/**
 * Returns either the width in pixels of the content of an element or the width of the element itself, whichever is greater.
 * If the element is wider than its content area (for example, if there are scroll bars for scrolling through the content),
 * the scrollWidth is larger than the clientWidth.
 *
 * Returns a number without unity.
 *
 * @property scrollWidth
 * @type Number
 * @readOnly
 */

/**
 * Gets or sets the element's attribute `type`. Only applies for the `script`, `img` and `style`-elements.
 *
 * @property src
 * @type String
 */

/**
 * Gets or sets the element's attribute `style`.
 *
 * @property style
 * @type String
 */

/**
 * Gets or sets the element's attribute `type`. Only applies for the `input`-element.
 *
 * @property type
 * @type String
 */

/**
* Gets or sets the value of an input or select Element.
*
* Note it is highly preferable to use getValue() and setValue().
*
* @property value
* @type String
* @since 0.0.1
*/